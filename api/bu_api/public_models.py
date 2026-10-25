"""Stable, typed projections of BU's 20261024 public-services schema."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

DiningLocationId = Literal["marciano", "warren", "west"]


class BUCampusRequest(BaseModel):
    resource: Literal["routes", "vehicles", "arrivals", "notices", "locations", "menu", "item"]
    location: DiningLocationId | None = None
    day: date | None = None
    stop_id: int | None = Field(default=None, gt=0)
    item_id: str | None = Field(default=None, min_length=1, max_length=128)

    @model_validator(mode="after")
    def resource_parameters(self):
        if self.resource == "arrivals" and self.stop_id is None:
            raise ValueError("Arrivals require a stop_id from the routes response")
        if self.resource in {"menu", "item"} and self.location is None:
            raise ValueError("Dining menus/items require a location")
        if self.resource == "item" and self.item_id is None:
            raise ValueError("Item details require an item_id from the menu response")
        return self


class BUFreshness(BaseModel):
    fetched_at: datetime
    stale: bool = False
    source: str


class BUStop(BaseModel):
    id: int
    physical_stop_id: int
    name: str
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    order: int


class BUBusRoute(BaseModel):
    id: int
    name: str
    encoded_polyline: str
    is_running: bool
    color: str | None
    show_route_arrows: bool
    stops: list[BUStop]


class BUBusRoutes(BUFreshness):
    routes: list[BUBusRoute]


class BUBusVehicle(BaseModel):
    id: int
    name: str
    route_id: int
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    heading: float
    ground_speed: float
    is_delayed: bool
    is_on_route: bool
    reported_at: datetime | None


class BUBusVehicles(BUFreshness):
    vehicles: list[BUBusVehicle]


class BUArrival(BaseModel):
    estimate_at: datetime | None
    scheduled_at: datetime | None
    seconds: int | None
    is_arriving: bool
    is_departed: bool
    vehicle_id: int | None
    on_time_status: str | int | None
    status_text: str | None
    is_live: bool


class BUArrivalGroup(BaseModel):
    route_id: int
    route_name: str
    route_stop_id: int
    physical_stop_id: int
    stop_name: str
    arrivals: list[BUArrival]


class BUBusArrivals(BUFreshness):
    stop_id: int
    groups: list[BUArrivalGroup]


class BUBusNotice(BaseModel):
    id: str
    kind: str
    text: str
    posted_at: datetime | None = None
    source_url: str | None = None


class BUBusNotices(BUFreshness):
    notices: list[BUBusNotice]
    partial: bool = False
    warnings: list[str] = Field(default_factory=list)


class BUDiningLocation(BaseModel):
    id: DiningLocationId
    name: str
    short_name: str
    campus: str
    address: str
    source_url: str


class BUDiningLocations(BaseModel):
    locations: list[BUDiningLocation]
    source: str = "Boston University Dining Services"
    source_url: str = "https://www.bu.edu/dining/"


class BUDiningSchedule(BaseModel):
    meal: str
    opens_at: str
    closes_at: str


class BUDiningItem(BaseModel):
    id: str
    name: str
    description: str | None = None
    calories: int | float | None = None
    carbohydrates_grams: int | float | None = None
    protein_grams: int | float | None = None
    saturated_fat_grams: int | float | None = None
    vegetarian: bool = False
    vegan: bool = False
    gluten_free: bool = False
    halal: bool = False
    cool_food: bool = False


class BUDiningStation(BaseModel):
    name: str
    items: list[BUDiningItem]


class BUDiningMeal(BaseModel):
    name: str
    stations: list[BUDiningStation]
    item_count: int


class BUDiningMenu(BUFreshness):
    location: BUDiningLocation
    date: date
    schedules: list[BUDiningSchedule]
    meals: list[BUDiningMeal]
    open_now: bool
    status: str
    current_meal: str | None = None
    source_url: str


class BUDiningItemDetail(BUDiningItem, BUFreshness):
    location: BUDiningLocation
    date: date
    meal: str
    station: str
    ingredients: str | None = None
    source_url: str
    allergy_notice: str = (
        "Menus and ingredients can change. If you have a food allergy, "
        "speak with BU Dining staff before ordering."
    )
