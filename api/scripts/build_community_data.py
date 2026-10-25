"""Build reproducible SYNTHETIC community fixtures; no real student outcomes/abuse labels.

Each moderation scenario is an atomic split group. Study cohorts use disjoint
synthetic student IDs and later dates for dev/test. Never train on app messages.
"""

import json
import random
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "research/community-training"
SEED = 20261024

# Independent authored scenarios, with all wording variants kept in the same split.
BENIGN = {
    "train": [
        "Used calculus textbook with a few pencil notes. Inspect before paying at the library.",
        "Wooden desk with surface scratches. Bring a friend to help carry it after class.",
        "Working desk lamp, warm bulb included. Campus pickup only.",
        "Giving away extra notebooks and unopened pens. Free to a student who needs them.",
        "Clean office chair with adjustable height. Test it at pickup before deciding.",
        "Graphing calculator with a fresh battery. I can demonstrate it in person.",
        "Chemistry textbook, previous edition. Please check the ISBN with your syllabus.",
        "Small fan from my dorm room. A little noisy but fully functional.",
        "USB monitor for sale. I will show it working on my laptop at the campus center.",
        "Two dining chairs, sold as a pair. Available this weekend on campus.",
        "Backpack with a repaired zipper. Photos show the wear clearly.",
        "Spare art supplies from a finished class. Most paint tubes are partly used.",
        "Mini bookcase in good condition. Measurements and extra photos available.",
        "Selling my spare keyboard because I changed computers. All keys work.",
        "Economics book with highlighting. Pay cash or Venmo after checking it at pickup.",
        "Bike helmet, unused in its packaging. Selling because it does not fit.",
        "Lab goggles and a clean lab coat, both used for one semester.",
        "Dorm rug with a small stain under one corner, shown in the photos.",
    ],
    "dev": [
        "Selling a secondhand laptop stand. Meet at the student union and inspect it first.",
        "Free folders left over from orientation. No delivery or payment needed.",
        "Biology textbook, binding intact, with some handwritten study notes.",
        "A bedside table I no longer use. Please bring your own transport.",
        "Coffee maker in working condition. Can bring it to campus for pickup.",
        "Portable speaker with a weak battery. It works when plugged in; priced accordingly.",
    ],
    "test": [
        "Wireless mouse, receipt available, happy to let you test it before buying.",
        "Free moving boxes outside the residence common area. First come first served.",
        "Statistics book, same ISBN as listed, water mark on the back cover.",
        "I can hold this shelf until tomorrow. No deposit required, pay when you collect.",
        "Selling a used tablet stylus. Verify compatibility with your device at pickup.",
        "A set of storage bins, cracked lid on one bin. Photos show all defects.",
    ],
}
SUSPICIOUS = {
    "train": [
        "Pay a nonrefundable reservation fee before I tell you where the item is.",
        "I only accept gift card codes sent in advance. No in-person inspection.",
        "Send your university login and password to verify that you can buy this desk.",
        "Click my external verification site and enter your bank credentials to see the item.",
        "Guaranteed investment profit for students. Send crypto now to double your tuition money.",
        "I am overseas; wire the full payment first and my courier will deliver it later.",
        "No actual item for sale. Join my paid referral program and recruit classmates.",
        "Send me the one-time login code you receive so I can confirm your purchase.",
        "Text me your credit card number and security code to reserve the book.",
        "Special campus grant: pay a processing fee now to unlock thousands in funding.",
        "I will send you a check for too much; return the difference to my shipping agent.",
        "This is a bulk advertisement for essay writing services, not a used textbook.",
        "Instant guaranteed earnings. Buy my starter kit and recruit five students.",
        "I have no photos or item details. Only paying customers get to see what is offered.",
        "Use this shortened payment link immediately; I refuse campus pickup or any questions.",
        "I am selling access to stolen campus accounts with working passwords.",
        "I need a copy of your passport and banking password before I can sell a chair.",
        "Send a cryptocurrency deposit in the next five minutes or lose this incredible deal.",
    ],
    "dev": [
        "To buy this notebook, first send the activation PIN from a prepaid store card.",
        "Your account must be validated on my offsite portal using your campus password.",
        "You won a scholarship. Transfer the handling charge before I release your prize.",
        "I cannot show the laptop. Pay the entire price via irreversible transfer before delivery.",
        "Make easy money reselling fake admissions letters to other students through my program.",
        "Before pickup, send the verification code from your banking app to my number.",
    ],
    "test": [
        "Reserve this textbook by sending a photo of an unused gift voucher and its secret code.",
        "I need your account recovery phrase to activate the tablet before you receive it.",
        "Earn a guaranteed huge return overnight by depositing digital coins into my wallet.",
        "No meeting or inspection allowed. Pay a compulsory insurance charge to my delivery agent.",
        "Purchase my membership and advertise it to classmates; there is no physical item.",
        "Please share the password to your student email so I can approve this sale.",
    ],
}
BOUNDARY = [
    ("Please do not send deposits or gift card codes. Pay for this book only at pickup.", 0),
    ("I accept cash at pickup. I will never ask for a bank password or verification code.", 0),
    ("Selling a wallet, empty with no cards inside. Meet on campus.", 0),
    ("Crypto textbook about distributed systems. Pay cash after inspecting the book.", 0),
    ("Campus security course textbook about phishing and password theft. Local pickup.", 0),
    ("I lost the original receipt but you can test this monitor before paying.", 0),
    ("This gift card envelope is empty stationery for an art project, free to collect.", 0),
    ("Student guide to banking, used paperback. No online payment needed.", 0),
    ("Final price is negotiable. I am moving away next week, pickup on campus today.", 0),
    ("My scholarship covered a new calculator, so I am giving the old one away.", 0),
    ("After you send the full amount, I will disclose which item you bought. No refunds.", 1),
    ("Send your identity documents plus your email password to receive this free laptop.", 1),
    ("Your purchase is frozen. Pay a release fee to a third party before we can meet.", 1),
    ("I can sell you leaked exam answers if you pay me privately with digital currency.", 1),
    ("Transfer a deposit to my broker abroad. There is no campus pickup or live demonstration.", 1),
    ("Give me your card security number and I will arrange the campus delivery myself.", 1),
]


def write_jsonl(path, rows):
    path.write_text("".join(json.dumps(row, sort_keys=True) + "\n" for row in rows))


def build():
    OUT.mkdir(parents=True, exist_ok=True)
    scenarios, listings = [], []
    endings = [
        "Available this semester.",
        "Message through the campus app.",
        "Please read the description.",
        "Listed for the university community.",
        "Ask about availability.",
        "Listing details are above.",
    ]
    for split in ("train", "dev", "test"):
        for label, source in ((0, BENIGN), (1, SUSPICIOUS)):
            for i, text in enumerate(source[split]):
                group = f"{split}-{label}-{i:02}"
                scenarios.append({"group": group, "split": split, "text": text, "label": label})
                for j, ending in enumerate(endings):
                    listings.append(
                        {
                            "id": f"{group}-{j}",
                            "group": group,
                            "split": split,
                            "text": f"Campus listing\n{text} {ending}",
                            "label": label,
                            "provenance": "authored_synthetic_not_reviewed_real_abuse",
                        }
                    )
    (OUT / "moderation_scenarios.json").write_text(json.dumps(scenarios, indent=2) + "\n")
    write_jsonl(OUT / "moderation.jsonl", listings)
    write_jsonl(
        OUT / "boundary.jsonl",
        [
            {"id": f"boundary-{i}", "text": text, "label": label, "split": "boundary"}
            for i, (text, label) in enumerate(BOUNDARY)
        ],
    )

    rng = random.Random(SEED)
    studies = []
    # Disjoint cohorts prevent a synthetic student from appearing on both sides of a split.
    for split, count, day in [("train", 180, 0), ("dev", 40, 30), ("test", 60, 60)]:
        for q in range(count):
            query_id = f"{split}-query-{q:03}"
            for c in range(8):
                a, g = rng.random(), rng.choice([0, 1 / 3, 1 / 2, 2 / 3, 1])
                f, m = rng.choice([0, 1]), rng.choice([0, 1])
                interests = rng.choice([0, 1 / 3, 1 / 2, 1])
                shared = rng.choice([1 / 3, 2 / 3, 1])
                prefs = (f + m) / 2
                features = [a, g, f, m, interests, shared, a * g, a * prefs]
                # Explicit synthetic preference rubric + noise, NOT observed study outcomes.
                utility = (
                    0.36 * a
                    + 0.20 * g
                    + 0.08 * f
                    + 0.06 * m
                    + 0.04 * interests
                    + 0.04 * shared
                    + 0.14 * a * g
                    + 0.08 * a * prefs
                    + rng.gauss(0, 0.035)
                )
                studies.append(
                    {
                        "id": f"{query_id}-candidate-{c}",
                        "query_id": query_id,
                        "split": split,
                        "student_ids": [f"{query_id}-student", f"{query_id}-candidate-{c}-student"],
                        "recorded_on": str(date(2026, 1, 1) + timedelta(days=day + q % 20)),
                        "features": features,
                        "relevance": max(0, min(1, utility)),
                        "provenance": "synthetic_rubric_not_observed_outcome",
                    }
                )
    write_jsonl(OUT / "study.jsonl", studies)
    (OUT / "provenance.json").write_text(
        json.dumps(
            {
                "seed": SEED,
                "synthetic_only": True,
                "moderation_rows": len(listings),
                "study_rows": len(studies),
                "boundary_rows": len(BOUNDARY),
                "no_real_student_data": True,
                "limitations": [
                    "No real reviewed abuse labels",
                    "No actual student outcomes",
                    "No claim of production scam detection or matching usefulness",
                ],
            },
            indent=2,
        )
        + "\n"
    )
    print(
        f"Built {len(studies)} synthetic study candidates "
        f"and {len(listings)} synthetic listing texts."
    )


if __name__ == "__main__":
    build()
