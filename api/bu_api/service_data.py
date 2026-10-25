"""Explicit fictional fixtures aligned with the app, never official BU records."""

from datetime import timedelta

from .service_models import (
    Club,
    DiningTransaction,
    Employment,
    HousingContacts,
    HousingRequest,
    ResourceLink,
    ResourcePage,
    Thread,
)

MY_HOUSING = "https://bu.starrezhousing.com/StarRezPortalX"
DEPOSIT_URL = "https://www.bu.edu/seo/getting-paid/direct-deposit/"

CLUBS = [
    Club(
        id="data-science-association",
        initials="DS",
        name="Data Science Association",
        tagline="Build skills, meet peers, and explore data for social impact.",
        about="Weekly workshops, project teams, alumni talks, and a welcoming place to learn.",
        tags=["Technology", "Career", "Community"],
        member_count=240,
        meeting_schedule="Tuesdays",
        welcome="All levels",
        open_house={
            "title": "Data Science Association Open House",
            "starts_at": "2026-10-24T18:00:00-04:00",
            "ends_at": "2026-10-24T19:00:00-04:00",
            "location": "CDS 1646",
        },
    ),
    Club(
        id="bu-spark",
        initials="S!",
        name="BU Spark!",
        tagline="Experiential learning and student projects.",
        about="Fictional prototype club profile for the Spark community chat.",
        tags=["Technology", "Community"],
        member_count=42,
        meeting_schedule="See club announcements",
        welcome="All levels",
    ),
]

CONTACTS = HousingContacts(
    residences=[
        {"label": "CRC / Fenway Facilities", "value": "617-353-2105", "href": "tel:+16173532105"},
        {"label": "Medical Campus", "value": "617-358-4144", "href": "tel:+16173584144"},
        {"label": "My Housing", "value": "Official portal", "href": MY_HOUSING},
    ],
    real_estate=[{"label": "BU Real Estate", "value": "617-353-4102", "href": "tel:+16173534102"}],
    emergency=[
        {"label": "Emergency", "value": "911", "href": "tel:911"},
        {"label": "BUPD", "value": "617-353-2121", "href": "tel:+16173532121"},
        {"label": "Facilities", "value": "617-353-2105", "href": "tel:+16173532105"},
    ],
)

LINKS = [
    ResourceLink(id=key, title=title, description=copy, url=url)
    for key, title, copy, url in [
        (
            "terrierWeb",
            "Terrier Web",
            "Continue to the official student portal.",
            "https://terrier-web.bu.edu/StudentPortal",
        ),
        (
            "get",
            "GET",
            "Continue to the official dining account portal.",
            "https://get.cbord.com/bu/full/prelogin.php",
        ),
        ("myHousing", "My Housing", "Continue to the official housing portal.", MY_HOUSING),
        (
            "jobs",
            "Find student jobs",
            "Continue to BU's public student job board information.",
            "https://www.bu.edu/seo/student-job-board/",
        ),
        (
            "employmentHelp",
            "Student Employment help",
            "Official Student Employment resources.",
            "https://www.bu.edu/seo/",
        ),
        (
            "timesheetGuidance",
            "Timesheet guidance",
            "Confirm official submission deadlines.",
            "https://www.bu.edu/seo/getting-paid/timesheets/",
        ),
        (
            "salaryStatements",
            "Salary statements",
            "View official statements in MyBU.",
            "https://mybu.bu.edu/",
        ),
        (
            "directDeposit",
            "Manage direct deposit securely",
            "Banking changes use the official portal.",
            DEPOSIT_URL,
        ),
        (
            "employmentResource",
            "Student Employment resource",
            "Official public resources.",
            "https://www.bu.edu/seo/",
        ),
        (
            "buPolice",
            "BU Police",
            "Official public safety resources.",
            "https://www.bu.edu/police/",
        ),
    ]
]

PAGES = [
    ResourcePage(id=key, title=title, intro=intro, rows=rows)
    for key, title, intro, rows in [
        (
            "academic-calendar",
            "Academic Calendar",
            "Static prototype context; confirm official dates.",
            ["Academic dates and suspended classes are available in /courses term metadata"],
        ),
        (
            "map-transit",
            "Map & Transit",
            "Static campus resources; no live routing feed.",
            ["BU Shuttle status · Demo connection", "Step-free route preferences", "Campus map"],
        ),
        (
            "campus-resources",
            "Campus Resources",
            "Student support resources.",
            ["Academic advising", "Student Health Services", "Dean of Students"],
        ),
        (
            "safety-emergency",
            "Safety & Emergency",
            "Preparedness resources.",
            ["BU Police · 617-353-2121", "Emergency guidance", "Safety escort information"],
        ),
        (
            "data-connections",
            "Data Connections",
            "Prototype data sources.",
            [
                "Student data · Fictional fixtures",
                "Events · Terrier Central feed",
                "Campus services · Persistent prototype state",
            ],
        ),
        ("notifications", "Notifications", "Saved in /settings/preferences.", []),
        ("accessibility", "Accessibility", "Saved in /settings/preferences.", []),
        (
            "privacy",
            "Privacy",
            "Display preferences; device authentication is handled by the app.",
            ["Grades hidden by default", "No biometric authentication is performed by this API"],
        ),
        (
            "help-feedback",
            "Help & Feedback",
            "Static prototype support resources.",
            ["BU IT Help Center", "Report an accessibility issue", "Prototype feedback"],
        ),
        (
            "sign-out",
            "Sign Out",
            "The app manages the local demo session.",
            ["This API uses a shared prototype bearer password"],
        ),
    ]
]


def initial_threads(student, repository):
    at = student.profile.as_of
    result = []
    for course in repository.registered_courses(student):
        lecture = next(s for s in course.sections if s.component == "lecture")
        result.append(
            Thread(
                id=f"class-{course.id}",
                kind="class",
                course_id=course.id,
                title=f"{course.code} {lecture.id}",
                avatar=course.code.split()[-2],
                notice="Course chat · Academic integrity rules apply",
                pinned={
                    "label": "PINNED · TA NORA",
                    "title": "Midterm review sheet is posted",
                    "body": "Prototype announcement: office hours in CDS 1301.",
                },
                messages=[
                    {
                        "id": f"{course.id}-m1",
                        "author_id": "demo-jamie",
                        "author": "Jamie",
                        "body": "Does anyone want to compare practice problem 4?",
                        "created_at": at.replace(hour=9, minute=38),
                    },
                    {
                        "id": f"{course.id}-m2",
                        "author_id": "demo-sam",
                        "author": "Sam",
                        "body": "I can join at Mugar's fourth floor around 1.",
                        "created_at": at.replace(hour=9, minute=42),
                    },
                ],
            )
        )
    for club in CLUBS:
        result.append(
            Thread(
                id=club.id,
                kind="club",
                club_id=club.id,
                title=club.name,
                avatar=club.initials,
                notice="Club chat · Prototype conversation",
                messages=[
                    {
                        "id": "welcome",
                        "author_id": "demo-priya",
                        "author": "Priya",
                        "body": "Welcome! Check the club profile for upcoming activities.",
                        "created_at": at.replace(hour=8, minute=18),
                    }
                ],
            )
        )
    result.append(
        Thread(
            id="jamie-lee",
            kind="dm",
            title="Jamie Lee",
            avatar="JL",
            messages=[
                {
                    "id": "hello",
                    "author_id": "demo-jamie",
                    "author": "Jamie Lee",
                    "body": "Want to study after lecture?",
                    "created_at": at - timedelta(days=1),
                }
            ],
        )
    )
    return {thread.id: thread for thread in result}


def initial_requests(student):
    result = []
    for number, category, title, description, status in [
        (
            1048,
            "Heating & Cooling",
            "Heating noise",
            "The radiator makes a knocking sound during the evening.",
            "Assigned",
        ),
        (
            1032,
            "Furniture / Appliance / Key",
            "Desk drawer repair",
            "The upper desk drawer does not close.",
            "Resolved",
        ),
    ]:
        at = student.profile.as_of - timedelta(days=2)
        stages = ["Submitted", "Routed", "Assigned", "Scheduled / In progress", "Resolved"]
        result.append(
            HousingRequest(
                id=f"H-{number}",
                title=title,
                description=description,
                category=category,
                building="Warren Towers A",
                room="814",
                status=status,
                destination="Residence Life / Facilities",
                created_at=at,
                updates=[
                    {
                        "status": stage,
                        "text": f"Prototype request {stage.lower()}",
                        "created_at": at + timedelta(hours=i),
                    }
                    for i, stage in enumerate(stages[: stages.index(status) + 1])
                ],
            )
        )
    return {item.id: item for item in result}


def initial_employment():
    return Employment.model_validate(
        {
            "job": {
                "id": "spark-assistant",
                "title": "Student Assistant",
                "department": "BU Spark!",
                "supervisor": "Jordan Lee",
                "hourly_rate_cents": 1750,
            },
            "timesheets": [
                {
                    "id": "2026-10-19",
                    "starts_on": "2026-10-19",
                    "ends_on": "2026-10-25",
                    "due_at": "2026-10-25T23:59:00-04:00",
                    "hours": 8.5,
                    "gross_cents": 14875,
                    "shifts": [
                        {
                            "id": key,
                            "date": day,
                            "start": start,
                            "end": end,
                            "hours": hours,
                            "break_minutes": 0,
                        }
                        for key, day, start, end, hours in [
                            ("s1", "2026-10-19", "10:00", "12:30", 2.5),
                            ("s2", "2026-10-21", "13:00", "16:00", 3),
                            ("s3", "2026-10-23", "13:00", "16:00", 3),
                        ]
                    ],
                },
                {
                    "id": "2026-10-12",
                    "starts_on": "2026-10-12",
                    "ends_on": "2026-10-18",
                    "due_at": "2026-10-18T23:59:00-04:00",
                    "status": "Approved",
                    "hours": 11,
                    "gross_cents": 19250,
                },
                {
                    "id": "2026-10-05",
                    "starts_on": "2026-10-05",
                    "ends_on": "2026-10-11",
                    "due_at": "2026-10-11T23:59:00-04:00",
                    "status": "Paid",
                    "hours": 9.5,
                    "gross_cents": 16625,
                },
            ],
            "checklist": [
                {
                    "id": key,
                    "title": title,
                    "complete": complete,
                    "description": "Prototype status; verify requirements with Student Employment.",
                }
                for key, title, complete in [
                    ("jobx", "JobX hire confirmed", True),
                    ("i9", "Form I-9 completed", True),
                    ("tax", "Tax withholding review", False),
                    ("deposit", "Direct deposit authorization", True),
                    ("confidentiality", "Confidentiality acknowledgement", True),
                ]
            ],
            "pay": {
                "next_payday": "2026-10-30",
                "last_payment_on": "2026-10-23",
                "last_payment_cents": 18642,
                "ytd_gross_cents": 245000,
                "ytd_net_cents": 214870,
            },
            "direct_deposit": {
                "status": "Authorized",
                "account_last_four": "4821",
                "manage_url": DEPOSIT_URL,
            },
        }
    )


def transactions(student):
    at = student.profile.as_of
    rows = [
        DiningTransaction(
            id="warren-laundry",
            merchant="Warren Towers Laundry",
            occurred_at=at.replace(hour=14, minute=6) - timedelta(days=6),
            account="convenience_points",
            amount_cents=-350,
        )
    ]
    if student.meal_balance.plan_id:
        rows += [
            DiningTransaction(
                id="gsu-starbucks",
                merchant="GSU Starbucks",
                occurred_at=at.replace(hour=8, minute=42),
                account="dining_points",
                amount_cents=-625,
            ),
            DiningTransaction(
                id="city-convenience",
                merchant="City Convenience",
                occurred_at=at.replace(hour=19, minute=18) - timedelta(days=5),
                account="dining_points",
                amount_cents=-1240,
            ),
        ]
    return sorted(rows, key=lambda row: row.occurred_at, reverse=True)
