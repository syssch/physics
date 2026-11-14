#!/usr/bin/env python3
"""Make the synthetic test data in tests/fixtures/ from the real exports (run on Shi's Mac only).

The fixtures keep the *shape* of the real data — question ids, books, chapters, subtopics, skills, option layout,
figure names, Explain card chapters — but every question text, option, answer letter, solution and Explain card text
is replaced with made-up content. They are safe for the public repo and let the tests run anywhere (other AI agents,
GitHub Actions) without the real question bank or answer keys.

    cd learning-platform && python3 tools/make_test_fixtures.py
"""
import hashlib
import json
from pathlib import Path

APP = Path(__file__).resolve().parent.parent
EXPORT = APP.parent / "platform_prep" / "export"
OUT = APP / "tests" / "fixtures"


def pick(seed, options):
    return options[int(hashlib.sha256(seed.encode()).hexdigest(), 16) % len(options)]


def fake_question(q, n):
    keys = q.get("optionKeys") or ["A", "B", "C", "D"]
    out = {k: v for k, v in q.items() if k not in ("textHtml", "optionsHtml")}
    maths = n % 3 == 0
    out["textHtml"] = (f"<p>Synthetic question {n} on {q.get('topic', 'physics')}. "
                       + ("A body of mass $m$ moves with speed $v$; its kinetic energy is $\\frac{1}{2}mv^2$. " if maths else
                          "Which statement is correct? ")
                       + "(Placeholder text for automated tests.)</p>")
    if q.get("optionsType") == "table" and isinstance(q.get("optionsHtml"), dict) and "rows" in q["optionsHtml"]:
        heads = q["optionsHtml"].get("headers") or ["X", "Y"]
        out["optionsHtml"] = {"headers": [f"Column {i + 1}" for i in range(len(heads))],
                              "rows": {k: [f"{k}{i + 1}" for i in range(len(heads))] for k in keys}}
    else:
        out["optionsHtml"] = {k: f"<p>Option {k} for synthetic question {n}" + (" ($2.5\\,\\text{m}$)" if maths and k == "B" else "") + "</p>"
                              for k in keys}
    return out


def fake_bundle(b, ids=None):
    qs = [q for q in b["questions"] if ids is None or q["id"] in ids]
    questions = [fake_question(q, i + 1) for i, q in enumerate(qs)]
    answers = {q["id"]: pick(q["id"], q.get("optionKeys") or ["A", "B", "C", "D"]) for q in questions}
    return {"generatedAt": "synthetic", "name": b.get("name", "") + " (synthetic test data)", "topics": b["topics"],
            "books": b["books"], "skills": b.get("skills", []), "questions": questions, "answers": answers, "solutions": {},
            "retired": b.get("retired", [])}


def fake_explain(e):
    cards = []
    for i, c in enumerate(e["cards"]):
        c = dict(c)
        c["context"] = f"Synthetic context {i + 1}."
        c["questionHtml"] = f"<p><i>Synthetic explain question {i + 1} ({c.get('topic', '')}).</i></p>"
        c["answerHtml"] = f"<p>Synthetic marking-scheme answer {i + 1}.</p>"
        c["notesHtml"] = f"<ul><li>Synthetic teaching note {i + 1}.</li></ul>"
        c["examinerHtml"] = f"<p><i>Synthetic examiners' comment {i + 1}.</i></p>"
        cards.append(c)
    return {**{k: v for k, v in e.items() if k != "cards"}, "generatedAt": "synthetic", "cards": cards}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    trial = json.loads((EXPORT / "trial" / "bundle.json").read_text())
    full = json.loads((EXPORT / "all_ready" / "bundle.json").read_text())
    explain = json.loads((EXPORT / "explain" / "explain_bundle.json").read_text())
    # the "full import" fixture: every 5th ready question plus all of Ch 18 (section 15 checks chapter practice)
    ids = {q["id"] for i, q in enumerate(full["questions"]) if i % 5 == 0 or "18" in (q.get("chapters") or [])}
    files = {"trial.json": fake_bundle(trial), "all.json": fake_bundle(full, ids), "explain.json": fake_explain(explain)}
    for name, data in files.items():
        (OUT / name).write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
        print(f"tests/fixtures/{name}: {(OUT / name).stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
