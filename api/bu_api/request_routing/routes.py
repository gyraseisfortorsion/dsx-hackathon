"""Authenticated, read-only request classification; never submits tickets."""

from fastapi import Depends, HTTPException

from . import Department, RoutingRequest, RoutingResult


def install_routing_routes(app, selected_student):
    @app.get("/requests/departments", response_model=list[Department])
    def departments(student=Depends(selected_student)):
        router = app.state.request_router
        if router is None:
            raise HTTPException(503, "Request routing artifacts unavailable")
        return list(router.departments.values())

    @app.post("/requests/route", response_model=RoutingResult)
    def route(body: RoutingRequest, student=Depends(selected_student)):
        router = app.state.request_router
        if router is None:
            raise HTTPException(503, "Request routing artifacts unavailable")
        return router.route(body.text)
