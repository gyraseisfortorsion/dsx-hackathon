"""Authenticated discovery and per-demo-user personalization routes."""

import asyncio

from fastapi import Depends, HTTPException, Query

from .events import (
    GOALS,
    INTERESTS,
    EventCard,
    EventFilters,
    EventResults,
    EventSearch,
    Feedback,
    Preferences,
    TagCorrection,
)
from .history import HistoryConflict


def install_event_routes(app, selected_student):
    def run(student, request, general=False):
        state = app.state.preferences.load(student.profile.user)
        try:
            return app.state.events.search(
                student, app.state.repository.calendar(student), state, request, general=general
            )
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None

    @app.get("/preferences", response_model=Preferences)
    def preferences(student=Depends(selected_student)):
        return app.state.preferences.load(student.profile.user).preferences

    @app.put("/preferences", response_model=Preferences)
    async def update_preferences(body: Preferences, student=Depends(selected_student)):
        store, user = app.state.preferences, student.profile.user
        async with store.lock(user):
            state = await asyncio.to_thread(store.load, user)
            if body.version != state.preferences.version:
                raise HistoryConflict("Preferences changed; reload and retry")
            state.preferences = body.model_copy(update={"version": body.version + 1})
            await asyncio.to_thread(store.save, user, state)
            return state.preferences

    @app.get("/events/options")
    def options(student=Depends(selected_student)):
        return {
            "interests": [{"id": k, "label": k.title(), "topics": v} for k, v in INTERESTS.items()],
            "goals": [{"id": k, "label": k.replace("_", " ").title()} for k in GOALS],
            "categories": sorted({e["source_category"] for e in app.state.events.events}),
            "clusters": list(app.state.events.clusters.values()),
            "defaults": Preferences().model_dump(),
            "artifact_version": app.state.events.version,
            "data": app.state.events.manifest,
        }

    @app.get("/events", response_model=EventResults)
    def events(
        limit: int = Query(20, ge=1, le=100),
        offset: int = Query(0, ge=0, le=10000),
        category: str | None = None,
        cluster: str | None = None,
        avoid_schedule_conflicts: bool | None = None,
        student=Depends(selected_student),
    ):
        return run(
            student,
            EventSearch(
                limit=limit,
                offset=offset,
                filters=EventFilters(
                    category_ids=[category] if category else [],
                    cluster_ids=[cluster] if cluster else [],
                    avoid_schedule_conflicts=avoid_schedule_conflicts,
                ),
            ),
            general=True,
        )

    @app.get("/events/recommended", response_model=list[EventCard])
    def recommended(
        limit: int = Query(20, ge=1, le=100),
        avoid_schedule_conflicts: bool | None = None,
        student=Depends(selected_student),
    ):
        return run(
            student,
            EventSearch(
                limit=limit,
                filters=EventFilters(
                    avoid_schedule_conflicts=avoid_schedule_conflicts,
                ),
            ),
        ).items

    @app.post("/events/search", response_model=EventResults)
    def search(body: EventSearch, student=Depends(selected_student)):
        return run(student, body)

    @app.get("/events/clusters")
    def clusters(student=Depends(selected_student)):
        result = run(student, EventSearch(limit=100), general=True)
        # Count across all eligible events, not just the first page.
        counts = {key: 0 for key in app.state.events.clusters}
        for offset in range(0, result.total, 100):
            page = (
                result
                if offset == 0
                else run(student, EventSearch(limit=100, offset=offset), general=True)
            )
            for event in page.items:
                counts[event.cluster_id] += 1
        return {
            "artifact_version": result.artifact_version,
            "clusters": [
                metadata | {"upcoming_count": counts[key]}
                for key, metadata in app.state.events.clusters.items()
            ],
        }

    def card(student, eid):
        event = app.state.events.by_id.get(eid)
        if event is None:
            raise HTTPException(404, "Unknown event")
        state = app.state.preferences.load(student.profile.user)
        feedback = state.feedback.get(eid, Feedback())
        from datetime import datetime

        start = datetime.fromisoformat(event["starts_at"])
        end = datetime.fromisoformat(event["ends_at"]) if event["ends_at"] else None
        conflicts = [
            e.id
            for e in app.state.repository.calendar(student).events
            if end and e.ends_at and start < e.ends_at and e.starts_at < end
        ]
        built = EventCard(
            **event,
            **feedback.model_dump(),
            conflict_ids=conflicts,
            conflict_check_complete=end is not None,
        )
        return apply_tag_correction(built, state.tag_corrections.get(eid))

    def apply_tag_correction(card_obj, correction):
        """An organizer correction OVERRIDES the auto tags. An empty corrected set is
        a real correction ('no tag applies'), not 'uncorrected'. Organizer tags have
        no score (null).
        """
        if correction is None:
            return card_obj
        app.state.tag_taxonomy.assert_known(correction.final_tag_ids)
        return card_obj.model_copy(
            update={
                "tags": {tid: None for tid in correction.final_tag_ids},
                "tag_source": "organizer",
            }
        )

    @app.get("/events/saved", response_model=list[EventCard])
    def saved(student=Depends(selected_student)):
        state = app.state.preferences.load(student.profile.user)
        return [
            card(student, eid)
            for eid, fb in state.feedback.items()
            if fb.saved and eid in app.state.events.by_id
        ]

    @app.get("/events/{event_id}", response_model=EventCard)
    def details(event_id: str, student=Depends(selected_student)):
        return card(student, event_id)

    @app.put("/events/{event_id}/feedback")
    async def feedback(event_id: str, body: Feedback, student=Depends(selected_student)):
        if event_id not in app.state.events.by_id:
            raise HTTPException(404, "Unknown event")
        store, user = app.state.preferences, student.profile.user
        async with store.lock(user):
            state = await asyncio.to_thread(store.load, user)
            if state.feedback.get(event_id, Feedback()) != body:
                state.feedback[event_id] = body
                state.preferences.version += 1
                await asyncio.to_thread(store.save, user, state)
            return {
                "event_id": event_id,
                "profile_version": state.preferences.version,
                **body.model_dump(),
            }

    @app.get("/events/{event_id}/tags/suggest")
    def suggest_tags(event_id: str, student=Depends(selected_student)):
        """Auto-suggest tags for an existing event from the fixed taxonomy."""
        event = app.state.events.by_id.get(event_id)
        if event is None:
            raise HTTPException(404, "Unknown event")
        scores = app.state.tag_scorer.score(event.get("title", ""), event.get("description", ""))
        result = app.state.tagger.build(
            event_id, app.state.tag_scorer.version,
            event.get("title", ""), event.get("description", ""), scores,
        )
        correction = app.state.preferences.load(student.profile.user).tag_corrections.get(event_id)
        payload = result.to_json()
        # Per-student override (not a shared organizer edit); see PUT /events/{id}/tags.
        payload["user_corrected"] = correction is not None
        payload.pop("organizer_corrected", None)
        if correction is not None:
            payload["corrected_tag_ids"] = correction.final_tag_ids
        return payload

    @app.put("/events/{event_id}/tags")
    async def correct_tags(event_id: str, body: TagCorrection, student=Depends(selected_student)):
        """Store a PER-STUDENT tag override for an event (empty set allowed).

        LIMITATION (prototype): this is scoped to the calling demo user, stored in
        that user's PreferenceState. It is NOT a shared, organizer-wide correction
        visible to other students -- the app has no separate organizer identity yet.
        The override takes priority over the auto-assigned tags for THIS user only.
        """
        if event_id not in app.state.events.by_id:
            raise HTTPException(404, "Unknown event")
        try:
            app.state.tag_taxonomy.assert_known(body.final_tag_ids)
        except ValueError:
            raise HTTPException(422, "final_tag_ids contains a tag not in the taxonomy") from None
        store, user = app.state.preferences, student.profile.user
        async with store.lock(user):
            state = await asyncio.to_thread(store.load, user)
            state.tag_corrections[event_id] = body
            state.preferences.version += 1
            await asyncio.to_thread(store.save, user, state)
        return card(student, event_id)
