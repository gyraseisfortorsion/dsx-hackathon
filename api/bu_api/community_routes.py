"""Shared, authorized study matching and marketplace routes for demo students."""

import asyncio
import secrets
from datetime import UTC, datetime, timedelta
from typing import Literal
from uuid import uuid4

from fastapi import Depends, Header, HTTPException, Query

from .community_logic import clean_windows, normalized, overlap, rank_match, sanitize_photo
from .community_ml import study_features
from .community_models import (
    Conversation,
    EnabledInput,
    FeedbackInput,
    Invitation,
    InviteAction,
    InviteInput,
    Listing,
    ListingInput,
    ListingText,
    Message,
    MessageInput,
    ModerationInput,
    PhotoInput,
    Report,
    ReportInput,
    StatusInput,
    StudyProfile,
)

KEY = "campus"
EXPECTATIONS = "Arrange payment and campus pickup directly. BU One provides no payment protection."


def install_community_routes(app, selected_student, settings):
    def now():
        return datetime.now(UTC)

    def read():
        return app.state.community.load(KEY).data

    def uid(student):
        return student.profile.user

    def verified(user, state):
        return (
            user in settings.community_verified_users.split(",")
            and user not in state.suspended
            and user not in state.deleted_accounts
        )

    def require_verified(user, state):
        if not verified(user, state):
            raise HTTPException(403, "A verified, active student account is required")

    def blocked(state, a, b):
        return b in state.blocks.get(a, []) or a in state.blocks.get(b, [])

    def account(user):
        if user not in app.state.repository.students:
            raise HTTPException(404, "Account not found")

    def find(rows, key):
        if key not in rows:
            raise HTTPException(404, "Item not found")
        return rows[key]

    def rate(state, user, kind, limit):
        key = f"{user}:{kind}"
        recent = [t for t in state.rates.get(key, []) if t > now() - timedelta(hours=1)]
        if len(recent) >= limit:
            raise HTTPException(429, "Hourly limit reached; try again later")
        state.rates[key] = [*recent, now()]

    async def mutate(student, change, *, needs_verification=True):
        store = app.state.community
        async with store.lock(KEY):
            stored = await asyncio.to_thread(store.load, KEY)
            if needs_verification:
                require_verified(uid(student), stored.data)
            result = change(stored.data)
            stored.data.version += 1
            await asyncio.to_thread(store.save, KEY, stored)
            return result

    def canonical(course):
        # Only compact forms of the catalog's actual code/ID are aliases. No fuzzy guesses.
        def compact(s):
            return "".join(c for c in s.casefold() if c.isalnum())

        for row in app.state.repository.courses.values():
            if compact(course) in (compact(row.id), compact(row.code)):
                return row.id
        raise HTTPException(422, "Select a course from the current BU catalog")

    def profile(state, user):
        return state.profiles.get(user) or StudyProfile(term=app.state.repository.catalog.term.id)

    def matches(state, user, ranking="rules"):
        own = profile(state, user)
        term = app.state.repository.catalog.term
        if not verified(user, state) or not own.discovery or own.term != term.id:
            return []
        rows = []
        for other, candidate in state.profiles.items():
            if (
                other == user
                or not verified(other, state)
                or not candidate.discovery
                or candidate.term != term.id
                or blocked(state, user, other)
            ):
                continue
            shared = sorted(set(own.course_ids) & set(candidate.course_ids))
            if not shared:
                continue
            windows = overlap(own, candidate, term, now(), settings.study_min_overlap_minutes)
            if not windows:
                continue
            rows.append(
                {
                    "student_id": other,
                    "display_name": app.state.repository.students[other].profile.full_name,
                    "university_id": "bu",
                    "course_ids": shared,
                    "shared_goals": sorted(set(own.goals) & set(candidate.goals)),
                    "study_format": candidate.study_format,
                    "meeting_mode": candidate.meeting_mode,
                    "campus_area": candidate.campus_area,
                    "overlap_minutes": int(sum((e - s).total_seconds() / 60 for s, e in windows)),
                    "windows": [{"starts_at": s, "ends_at": e} for s, e in windows],
                    "score": rank_match(
                        own, candidate, windows, settings.study_overlap_target_minutes
                    ),
                }
            )
        if ranking == "model":
            models = app.state.community_models
            if models is None or models.ranker is None:
                raise HTTPException(503, "Experimental study model unavailable; use ranking=rules")
            for row in rows:
                candidate = state.profiles[row["student_id"]]
                windows = [(w["starts_at"], w["ends_at"]) for w in row["windows"]]
                row["rule_score"] = row["score"]
                row["model"] = models.rank(
                    study_features(own, candidate, windows, settings.study_overlap_target_minutes)
                )
                row["score"] = row["model"]["score"]
            return sorted(rows, key=lambda r: (-r["model"]["raw_score"], r["student_id"]))
        return sorted(rows, key=lambda r: (-r["score"], r["student_id"]))

    def listing_status(item):
        if item.status in ("active", "reserved") and item.expires_at <= now():
            return "expired"
        return item.status

    def listing_card(state, item, user, *, photos=False):
        card = item.model_dump(mode="json")
        # Model review labels are private to the seller/moderation queue.
        if item.seller_id != user:
            card.pop("model_review", None)
        if item.status == "removed" and item.seller_id != user:
            card.update(
                title="Listing unavailable",
                description="Removed by moderation",
                photo_ids=[],
                isbn=None,
                edition=None,
                author=None,
                course_id=None,
            )
        card["status"] = listing_status(item)
        card["saved"] = item.id in state.saved.get(user, [])
        card["seller_name"] = app.state.repository.students[item.seller_id].profile.full_name
        card["price_label"] = "Free" if item.price_minor == 0 else f"${item.price_minor / 100:,.2f}"
        card["photos"] = [state.photos[p]["data"] for p in card["photo_ids"]] if photos else []
        card["thumbnail"] = (
            state.photos[card["photo_ids"][0]]["data"] if card["photo_ids"] else None
        )
        card["expectations"] = EXPECTATIONS
        return card

    def visible(state, item, user):
        return (
            not blocked(state, user, item.seller_id)
            and item.seller_id not in state.suspended
            and item.seller_id not in state.deleted_accounts
        )

    def owner(state, listing_id, user):
        item = find(state.listings, listing_id)
        if item.seller_id != user:
            raise HTTPException(403, "Only the seller can change this listing")
        if item.status == "removed":
            raise HTTPException(403, "This listing was removed by a moderator")
        if item.status == "deleted":
            raise HTTPException(410, "This listing has been deleted")
        return item

    def validate_listing(state, body, user, exclude=None):
        if body.course_id:
            body.course_id = canonical(body.course_id)
        for photo_id in body.photo_ids:
            photo = find(state.photos, photo_id)
            if photo["owner"] != user:
                raise HTTPException(403, "Use photos uploaded by your account")
        signature = (normalized(body.title), normalized(body.description), body.price_minor)
        for item in state.listings.values():
            if (
                item.id == exclude
                or item.seller_id != user
                or listing_status(item) not in ("active", "reserved")
            ):
                continue
            other = (normalized(item.title), normalized(item.description), item.price_minor)
            if signature == other:
                raise HTTPException(409, "Duplicate listing: edit your existing item instead")
        if re_repetitions(body.description):
            raise HTTPException(422, "Repeated spam text detected; describe your item once")

    def re_repetitions(text):
        words = normalized(text).split()
        return words if len(words) >= 20 and len(set(words)) / len(words) < 0.15 else []

    def conversation_for(state, cid, user):
        convo = find(state.conversations, cid)
        if user not in convo.participants:
            raise HTTPException(404, "Conversation not found")
        return convo

    def conversation_card(state, convo, user):
        card = convo.model_dump(mode="json")
        card["participant_names"] = [
            app.state.repository.students[p].profile.full_name for p in convo.participants
        ]
        card["blocked"] = any(blocked(state, user, p) for p in convo.participants if p != user)
        card["expectations"] = EXPECTATIONS if convo.listing_id else None
        if convo.listing_id:
            item = state.listings[convo.listing_id]
            card["title"] = item.title
            card["listing_status"] = listing_status(item)
        else:
            card["title"] = "Study conversation"
        return card

    @app.get("/community/config")
    def config(student=Depends(selected_student)):
        state = read()
        return {
            "university_id": "bu",
            "term": app.state.repository.catalog.term.id,
            "verified": verified(uid(student), state),
            "is_mock": True,
            "minimum_overlap_minutes": settings.study_min_overlap_minutes,
            "listing_expiry_days": settings.marketplace_expiry_days,
            "currency": "USD",
            "expectations": EXPECTATIONS,
            "courses": [
                {"id": c.id, "code": c.code, "title": c.title}
                for c in app.state.repository.courses.values()
            ],
            "blocked_accounts": state.blocks.get(uid(student), []),
            "deletion_requested": uid(student) in state.deletion_requests,
        }

    @app.get("/study/profile")
    def get_profile(student=Depends(selected_student)):
        return profile(read(), uid(student))

    @app.put("/study/profile")
    async def save_profile(body: StudyProfile, student=Depends(selected_student)):
        def change(state):
            if body.discovery:
                require_verified(uid(student), state)
                if not body.course_ids or not body.availability or not body.goals:
                    raise HTTPException(422, "Discovery needs courses, goals, and availability")
            if body.term != app.state.repository.catalog.term.id:
                raise HTTPException(
                    422, "Reconfirm your courses and availability for the current term"
                )
            body.course_ids = sorted({canonical(course) for course in body.course_ids})
            body.goals = sorted(set(body.goals))
            body.availability = clean_windows(body.availability)
            body.updated_at = now()
            state.profiles[uid(student)] = body
            return body

        return await mutate(student, change, needs_verification=False)

    @app.get("/study/matches")
    def get_matches(
        ranking: Literal["rules", "model"] = "rules", student=Depends(selected_student)
    ):
        if ranking == "model":
            models = app.state.community_models
            if models is None or models.ranker is None:
                raise HTTPException(503, "Experimental study model unavailable; use ranking=rules")
        rows = matches(read(), uid(student), ranking)
        return {
            "items": rows,
            "ranking": ranking,
            "synthetic_only": ranking == "model",
            "explanation": None
            if rows
            else (
                "No compatible classmates yet. Opt in, confirm this term, "
                "or add courses and study windows."
            ),
        }

    @app.get("/study/invitations")
    def invitations(student=Depends(selected_student)):
        return sorted(
            [i for i in read().invitations.values() if uid(student) in (i.sender, i.recipient)],
            key=lambda i: (i.created_at, i.id),
            reverse=True,
        )

    @app.post("/study/invitations", status_code=201)
    async def invite(body: InviteInput, student=Depends(selected_student)):
        def change(state):
            user = uid(student)
            course = canonical(body.course_id)
            match = next(
                (
                    m
                    for m in matches(state, user)
                    if m["student_id"] == body.recipient and course in m["course_ids"]
                ),
                None,
            )
            if not match:
                raise HTTPException(422, "This classmate is no longer eligible; refresh matches")
            pair = {user, body.recipient}
            if any(
                {i.sender, i.recipient} == pair and i.course_id == course and i.status == "pending"
                for i in state.invitations.values()
            ):
                raise HTTPException(409, "A pending invitation already exists for this course")
            rate(state, user, "invite", settings.community_invitations_per_hour)
            invitation = Invitation(
                **body.model_dump(exclude={"course_id"}),
                course_id=course,
                id=uuid4().hex,
                sender=user,
                created_at=now(),
                updated_at=now(),
            )
            state.invitations[invitation.id] = invitation
            return invitation

        return await mutate(student, change)

    @app.post("/study/invitations/{invitation_id}/action")
    async def invitation_action(
        invitation_id: str, body: InviteAction, student=Depends(selected_student)
    ):
        def change(state):
            item = find(state.invitations, invitation_id)
            user = uid(student)
            allowed = item.sender == user if body.action == "cancel" else item.recipient == user
            if not allowed:
                raise HTTPException(403, "This invitation action is not yours")
            if item.status != "pending":
                raise HTTPException(409, "Invitation is no longer pending")
            if blocked(state, item.sender, item.recipient):
                raise HTTPException(403, "Contact is blocked")
            if body.action == "accept":
                require_verified(item.sender, state)
                cid = uuid4().hex
                convo = Conversation(
                    id=cid,
                    participants=[item.sender, item.recipient],
                    invitation_id=item.id,
                    created_at=now(),
                )
                state.conversations[cid] = convo
                item.conversation_id = cid
            item.status = {"accept": "accepted", "decline": "declined", "cancel": "cancelled"}[
                body.action
            ]
            item.updated_at = now()
            return item

        return await mutate(student, change)

    @app.put("/study/invitations/{invitation_id}/feedback")
    async def feedback(invitation_id: str, body: FeedbackInput, student=Depends(selected_student)):
        def change(state):
            invitation = find(state.invitations, invitation_id)
            if (
                uid(student) not in (invitation.sender, invitation.recipient)
                or invitation.status != "accepted"
            ):
                raise HTTPException(
                    403, "Feedback requires an accepted invitation you participated in"
                )
            state.feedback[f"{invitation_id}:{uid(student)}"] = {
                **body.model_dump(),
                "created_at": now().isoformat(),
            }
            return body

        return await mutate(student, change)

    @app.get("/community/models")
    def model_status(student=Depends(selected_student)):
        models = app.state.community_models
        return {
            "synthetic_only": True,
            "study_ranker": models.ranker["version"] if models and models.ranker else None,
            "moderation": models.moderation["version"] if models and models.moderation else None,
            "automatic_review_flags_enabled": settings.community_ml_review_enabled,
            "automatic_removal_or_bans": False,
        }

    @app.post("/marketplace/analyze")
    async def analyze_listing(body: ListingText, student=Depends(selected_student)):
        models = app.state.community_models
        if models is None or models.moderation is None:
            raise HTTPException(503, "Experimental moderation model unavailable")
        require_verified(uid(student), read())
        assessment = await asyncio.to_thread(models.assess_listing, body.title, body.description)

        def change(state):
            rate(state, uid(student), "analyze", settings.community_messages_per_hour)
            return assessment

        return await mutate(student, change)

    async def assess_for_publication(student, body):
        if not settings.community_ml_review_enabled:
            return None
        require_verified(uid(student), read())
        models = app.state.community_models
        if models is None or models.moderation is None:
            return None
        return await asyncio.to_thread(models.assess_listing, body.title, body.description)

    def queue_model_review(state, item):
        assessment = item.model_review
        if assessment and assessment["flag_for_review"]:
            record = Report(
                id=uuid4().hex,
                reporter="system:model",
                target_type="listing",
                target_id=item.id,
                reason=assessment["reason"],
                created_at=now(),
            )
            state.reports[record.id] = record

    @app.post("/marketplace/photos", status_code=201)
    async def upload_photo(body: PhotoInput, student=Depends(selected_student)):
        data, digest = await asyncio.to_thread(sanitize_photo, body.data)

        def change(state):
            rate(state, uid(student), "photo", settings.community_listings_per_hour * 3)
            photo_id = uuid4().hex
            state.photos[photo_id] = {
                "owner": uid(student),
                "data": data,
                "hash": digest,
                "created_at": now().isoformat(),
            }
            return {"id": photo_id, "data": data, "processing_status": "ready"}

        return await mutate(student, change)

    @app.get("/marketplace/listings")
    def listings(
        q: str = Query("", max_length=200),
        category: Literal["books", "furniture", "supplies", "electronics", "other"] | None = None,
        condition: Literal["new", "like_new", "good", "fair"] | None = None,
        min_price: int = Query(0, ge=0),
        max_price: int | None = Query(None, ge=0),
        sort: Literal["relevance", "newest", "price_asc", "price_desc"] = "newest",
        scope: Literal["active", "mine", "saved"] = "active",
        offset: int = Query(0, ge=0),
        limit: int = Query(20, ge=1, le=50),
        student=Depends(selected_student),
    ):
        state, user = read(), uid(student)
        if max_price is not None and max_price < min_price:
            raise HTTPException(422, "Maximum price must be at least the minimum price")
        terms = normalized(q).split()
        rows = []
        for item in state.listings.values():
            if item.status == "deleted" or not visible(state, item, user):
                continue
            if scope == "active" and listing_status(item) not in ("active", "reserved"):
                continue
            if scope == "mine" and item.seller_id != user:
                continue
            if scope == "saved" and item.id not in state.saved.get(user, []):
                continue
            if category and item.category != category or condition and item.condition != condition:
                continue
            if (
                item.price_minor < min_price
                or max_price is not None
                and item.price_minor > max_price
            ):
                continue
            title, desc, isbn = (
                normalized(item.title),
                normalized(item.description),
                item.isbn or "",
            )
            compact_q = q.replace("-", "").replace(" ", "")
            exact_isbn = bool(compact_q and compact_q == isbn)
            if (
                terms
                and not exact_isbn
                and not all(t in title or t in desc or t in isbn for t in terms)
            ):
                continue
            relevance = 20 * exact_isbn + sum(3 * (t in title) + (t in desc) for t in terms)
            rows.append((item, relevance))
        if sort == "relevance":
            rows.sort(key=lambda r: (-r[1], -r[0].created_at.timestamp(), r[0].id))
        elif sort.startswith("price"):
            rows.sort(
                key=lambda r: (r[0].price_minor * (-1 if sort == "price_desc" else 1), r[0].id)
            )
        else:
            rows.sort(key=lambda r: (-r[0].created_at.timestamp(), r[0].id))
        return {
            "items": [listing_card(state, i, user) for i, _ in rows[offset : offset + limit]],
            "total": len(rows),
            "next_offset": offset + limit if offset + limit < len(rows) else None,
        }

    @app.post("/marketplace/listings", status_code=201)
    async def create_listing(body: ListingInput, student=Depends(selected_student)):
        assessment = await assess_for_publication(student, body)

        def change(state):
            user = uid(student)
            validate_listing(state, body, user)
            rate(state, user, "listing", settings.community_listings_per_hour)
            item = Listing(
                **body.model_dump(),
                id=uuid4().hex,
                seller_id=user,
                created_at=now(),
                updated_at=now(),
                expires_at=now() + timedelta(days=settings.marketplace_expiry_days),
                model_review=assessment,
            )
            state.listings[item.id] = item
            queue_model_review(state, item)
            # Reused photos flag a review; they never automatically remove an item.
            hashes = {state.photos[p]["hash"] for p in item.photo_ids}
            if any(
                i.id != item.id
                and i.seller_id == user
                and listing_status(i) in ("active", "reserved")
                and hashes & {state.photos[p]["hash"] for p in i.photo_ids}
                for i in state.listings.values()
            ):
                report = Report(
                    id=uuid4().hex,
                    reporter="system",
                    target_type="listing",
                    target_id=item.id,
                    reason="Seller reused a photo from another active listing; possible duplicate",
                    created_at=now(),
                )
                state.reports[report.id] = report
            return listing_card(state, item, user, photos=True)

        return await mutate(student, change)

    @app.get("/marketplace/listings/{listing_id}")
    def listing_detail(listing_id: str, student=Depends(selected_student)):
        state, user = read(), uid(student)
        item = find(state.listings, listing_id)
        if item.status == "deleted" or not visible(state, item, user):
            raise HTTPException(404, "Listing unavailable")
        return listing_card(state, item, user, photos=True)

    @app.put("/marketplace/listings/{listing_id}")
    async def edit_listing(listing_id: str, body: ListingInput, student=Depends(selected_student)):
        assessment = await assess_for_publication(student, body)

        def change(state):
            item = owner(state, listing_id, uid(student))
            validate_listing(state, body, uid(student), listing_id)
            for key, value in body.model_dump().items():
                setattr(item, key, value)
            item.updated_at = now()
            item.model_review = assessment
            queue_model_review(state, item)
            return listing_card(state, item, uid(student), photos=True)

        return await mutate(student, change)

    @app.put("/marketplace/listings/{listing_id}/status")
    async def change_status(listing_id: str, body: StatusInput, student=Depends(selected_student)):
        def change(state):
            item = owner(state, listing_id, uid(student))
            if (
                listing_status(item) == "expired"
                and body.status in ("active", "reserved")
                and not body.renew
            ):
                raise HTTPException(422, "Renew the listing before making it available")
            if body.renew:
                validate_listing(state, item, uid(student), item.id)
                if body.status != "active":
                    raise HTTPException(422, "Only an available item can be renewed")
                item.expires_at = now() + timedelta(days=settings.marketplace_expiry_days)
            item.status, item.updated_at = body.status, now()
            return listing_card(state, item, uid(student))

        return await mutate(student, change)

    @app.put("/marketplace/listings/{listing_id}/saved")
    async def save_listing(listing_id: str, body: EnabledInput, student=Depends(selected_student)):
        def change(state):
            item = find(state.listings, listing_id)
            if not visible(state, item, uid(student)):
                raise HTTPException(404, "Listing unavailable")
            saved = state.saved.setdefault(uid(student), [])
            if listing_id in saved:
                saved.remove(listing_id)
            if body.enabled:
                saved.append(listing_id)
            return {"saved": body.enabled}

        return await mutate(student, change)

    @app.get("/marketplace/listings/{listing_id}/related")
    def related(listing_id: str, student=Depends(selected_student)):
        state, user = read(), uid(student)
        item = find(state.listings, listing_id)
        candidates = [
            i
            for i in state.listings.values()
            if i.id != item.id
            and i.seller_id != user
            and visible(state, i, user)
            and listing_status(i) == "active"
        ]
        candidates.sort(
            key=lambda i: (
                -(i.category == item.category) * 3
                - bool(i.course_id and i.course_id == item.course_id) * 2
                - bool(i.isbn and i.isbn == item.isbn) * 3,
                abs(i.price_minor - item.price_minor),
                -i.created_at.timestamp(),
                i.id,
            )
        )
        return [listing_card(state, i, user) for i in candidates[:4]]

    @app.post("/marketplace/listings/{listing_id}/inquire")
    async def inquire(listing_id: str, student=Depends(selected_student)):
        def change(state):
            user = uid(student)
            item = find(state.listings, listing_id)
            require_verified(item.seller_id, state)
            if (
                item.seller_id == user
                or not visible(state, item, user)
                or listing_status(item) != "active"
            ):
                raise HTTPException(422, "This listing is unavailable for new inquiries")
            existing = next(
                (
                    c
                    for c in state.conversations.values()
                    if c.listing_id == listing_id and user in c.participants
                ),
                None,
            )
            if existing:
                return conversation_card(state, existing, user)
            rate(state, user, "initiate", settings.community_invitations_per_hour)
            convo = Conversation(
                id=uuid4().hex,
                participants=[user, item.seller_id],
                listing_id=listing_id,
                created_at=now(),
            )
            state.conversations[convo.id] = convo
            return conversation_card(state, convo, user)

        return await mutate(student, change)

    @app.get("/community/conversations")
    def conversations(student=Depends(selected_student)):
        state, user = read(), uid(student)
        require_verified(user, state)
        return [
            conversation_card(state, c, user)
            for c in sorted(
                state.conversations.values(),
                key=lambda c: (c.messages[-1].created_at if c.messages else c.created_at, c.id),
                reverse=True,
            )
            if user in c.participants
        ]

    @app.get("/community/conversations/{conversation_id}")
    def get_conversation(conversation_id: str, student=Depends(selected_student)):
        state = read()
        require_verified(uid(student), state)
        return conversation_card(
            state, conversation_for(state, conversation_id, uid(student)), uid(student)
        )

    @app.post("/community/conversations/{conversation_id}/messages", status_code=201)
    async def send_message(
        conversation_id: str, body: MessageInput, student=Depends(selected_student)
    ):
        def change(state):
            convo = conversation_for(state, conversation_id, uid(student))
            for other in convo.participants:
                require_verified(other, state)
                if blocked(state, uid(student), other):
                    raise HTTPException(403, "Contact is blocked")
            if convo.listing_id and state.listings[convo.listing_id].status in (
                "removed",
                "deleted",
            ):
                raise HTTPException(403, "This listing is no longer available for contact")
            rate(state, uid(student), "message", settings.community_messages_per_hour)
            message = Message(
                id=uuid4().hex, author_id=uid(student), body=body.body, created_at=now()
            )
            convo.messages.append(message)
            return message

        return await mutate(student, change)

    @app.put("/community/blocks/{target}")
    async def block(target: str, body: EnabledInput, student=Depends(selected_student)):
        account(target)
        if target == uid(student):
            raise HTTPException(422, "Choose another account")

        def change(state):
            blocks = state.blocks.setdefault(uid(student), [])
            if target in blocks:
                blocks.remove(target)
            if body.enabled:
                blocks.append(target)
                for invitation in state.invitations.values():
                    if {invitation.sender, invitation.recipient} == {
                        uid(student),
                        target,
                    } and invitation.status == "pending":
                        invitation.status, invitation.updated_at = "cancelled", now()
            return {"blocked": body.enabled}

        return await mutate(student, change, needs_verification=False)

    @app.post("/community/reports", status_code=201)
    async def report(body: ReportInput, student=Depends(selected_student)):
        def change(state):
            if body.target_type == "listing":
                find(state.listings, body.target_id)
            else:
                account(body.target_id)
            rate(state, uid(student), "report", 20)
            record = Report(
                **body.model_dump(), id=uuid4().hex, reporter=uid(student), created_at=now()
            )
            state.reports[record.id] = record
            return {"id": record.id, "status": record.status}

        return await mutate(student, change)

    @app.post("/community/deletion-request")
    async def deletion_request(student=Depends(selected_student)):
        def change(state):
            user = uid(student)
            state.deletion_requests[user] = now()
            if user not in state.deleted_accounts:
                state.deleted_accounts.append(user)
            if user in state.profiles:
                state.profiles[user].discovery = False
            for item in state.listings.values():
                if item.seller_id == user and item.status != "removed":
                    item.status = "withdrawn"
            return {
                "status": "requested",
                "message": (
                    "Discovery and contact disabled; a moderator must process "
                    "retained records and backups."
                ),
            }

        return await mutate(student, change, needs_verification=False)

    def moderator(x_moderator_token: str = Header(default="")):
        token = settings.community_moderator_token.get_secret_value()
        if not token or not secrets.compare_digest(token, x_moderator_token):
            raise HTTPException(403, "A separate moderator credential is required")

    @app.get("/community/moderation", dependencies=[Depends(moderator)])
    def moderation(student=Depends(selected_student)):
        state = read()
        return {
            "reports": [
                {
                    **r.model_dump(mode="json"),
                    "context": (
                        state.listings[r.target_id].model_dump(mode="json")
                        if r.target_type == "listing"
                        else {
                            "student_id": r.target_id,
                            "display_name": app.state.repository.students[
                                r.target_id
                            ].profile.full_name,
                            "suspended": r.target_id in state.suspended,
                        }
                    ),
                }
                for r in state.reports.values()
            ],
            "audit": state.audit,
            "suspended": state.suspended,
            "deletion_requests": state.deletion_requests,
        }

    @app.get("/community/metrics", dependencies=[Depends(moderator)])
    def metrics(student=Depends(selected_student)):
        state = read()
        active = [
            user
            for user, p in state.profiles.items()
            if p.discovery
            and p.term == app.state.repository.catalog.term.id
            and verified(user, state)
        ]
        feedback = list(state.feedback.values())
        accepted = sum(i.status == "accepted" for i in state.invitations.values())
        outcomes = [f for f in feedback if f.get("studied_together") is not None]
        reviewed = [r for r in state.reports.values() if r.status == "reviewed"]
        return {
            "opted_in_students": len(active),
            "students_with_matches": sum(bool(matches(state, user)) for user in active),
            "invitations_sent": len(state.invitations),
            "invitations_accepted": accepted,
            "feedback_responses": len(feedback),
            "useful_responses": sum(f["useful"] for f in feedback),
            "study_outcome_responses": len(outcomes),
            "reported_study_sessions": sum(f["studied_together"] for f in outcomes),
            "listings": len(state.listings),
            "seller_reported_sold": sum(i.status == "sold" for i in state.listings.values()),
            "reports": len(state.reports),
            "reviewed_reports": len(reviewed),
            "inquiries": sum(c.listing_id is not None for c in state.conversations.values()),
        }

    @app.post("/community/moderation/{report_id}", dependencies=[Depends(moderator)])
    async def moderate(report_id: str, body: ModerationInput, student=Depends(selected_student)):
        def change(state):
            record = find(state.reports, report_id)
            if body.action == "remove_listing":
                if record.target_type != "listing":
                    raise HTTPException(422, "Choose a listing report")
                item = find(state.listings, record.target_id)
                item.status, item.updated_at = "removed", now()
            elif body.action in ("suspend_account", "restore_account"):
                target = (
                    record.target_id
                    if record.target_type == "account"
                    else state.listings[record.target_id].seller_id
                )
                if target in state.suspended:
                    state.suspended.remove(target)
                if body.action == "suspend_account":
                    state.suspended.append(target)
            record.status = "reviewed"
            state.audit.append(
                {
                    "report_id": report_id,
                    "actor": uid(student),
                    **body.model_dump(),
                    "created_at": now().isoformat(),
                }
            )
            return record

        return await mutate(student, change, needs_verification=False)
