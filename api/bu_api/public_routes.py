"""Additive dining and transit routes. Existing student contracts stay unchanged."""

from datetime import date

from fastapi import Depends, Path

from .public_models import (
    BUBusArrivals,
    BUBusNotices,
    BUBusRoutes,
    BUBusVehicles,
    BUCampusRequest,
    BUDiningItemDetail,
    BUDiningLocations,
    BUDiningMenu,
    DiningLocationId,
)


def install_public_routes(app, selected_student):
    @app.get("/transit/bus/routes", response_model=BUBusRoutes)
    async def bus_routes(student=Depends(selected_student)):
        return await app.state.bu_public.fetch(BUCampusRequest(resource="routes"))

    @app.get("/transit/bus/vehicles", response_model=BUBusVehicles)
    async def bus_vehicles(student=Depends(selected_student)):
        return await app.state.bu_public.fetch(BUCampusRequest(resource="vehicles"))

    @app.get("/transit/bus/stops/{stop_id}/arrivals", response_model=BUBusArrivals)
    async def bus_arrivals(stop_id: int = Path(gt=0), student=Depends(selected_student)):
        return await app.state.bu_public.fetch(
            BUCampusRequest(resource="arrivals", stop_id=stop_id)
        )

    @app.get("/transit/bus/notices", response_model=BUBusNotices)
    async def bus_notices(student=Depends(selected_student)):
        return await app.state.bu_public.fetch(BUCampusRequest(resource="notices"))

    @app.get("/dining/locations", response_model=BUDiningLocations)
    async def dining_locations(student=Depends(selected_student)):
        return await app.state.bu_public.fetch(BUCampusRequest(resource="locations"))

    @app.get("/dining/locations/{location}/menu", response_model=BUDiningMenu)
    async def dining_menu(
        location: DiningLocationId, day: date | None = None, student=Depends(selected_student)
    ):
        return await app.state.bu_public.fetch(
            BUCampusRequest(resource="menu", location=location, day=day)
        )

    @app.get("/dining/locations/{location}/menu/items/{item_id}", response_model=BUDiningItemDetail)
    async def dining_item(
        location: DiningLocationId,
        item_id: str = Path(min_length=1, max_length=128),
        day: date | None = None,
        student=Depends(selected_student),
    ):
        return await app.state.bu_public.fetch(
            BUCampusRequest(resource="item", location=location, item_id=item_id, day=day)
        )
