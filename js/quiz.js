import { el, mount, toast, errMsg, store, typeset, fmtDate } from "./ui.js";
import { getQuestions, renderQuestion } from "./questions.js";

/**
 * Run a set of questions.
 * cfg: { title, subtitle, questionIds, saveKey, submit(responses) -> result }
 * result: { score, total, revealed, answers?, correct?, attemptId }
 */
export async function runQuiz(cfg) {
  const questions = await getQuestions(cfg.questionIds);
  const responses = store.get(cfg.saveKey) || {};
  const page = el("section", { class: "quiz" });
  const counter = el("span", {});
  const submitBtn = el("button", { class: "btn primary", type: "button" }, "Submit answers");
  const bar = el("div", { class: "submitbar" }, [counter, submitBtn]);
  const updateCounter = () => (counter.textContent = `${Object.keys(responses).length} of ${questions.length} answered`);

  page.append(el("h1", {}, cfg.title));
  if (cfg.subtitle) page.append(el("p", { class: "muted" }, cfg.subtitle));
  const list = el("div", {});
  page.append(list, bar);

  const draw = (q, i) => renderQuestion(q, {
    number: i + 1, selected: responses[q.id], showSource: cfg.showSource !== false,
    onSelect: (k) => {
      responses[q.id] = k;
      store.set(cfg.saveKey, responses);
      const fresh = draw(q, i);
      document.getElementById(`q-${q.id}`).replaceWith(fresh);
      typeset(fresh);
      updateCounter();
    },
  });
  questions.forEach((q, i) => list.append(draw(q, i)));
  updateCounter();

  submitBtn.addEventListener("click", async () => {
    const left = questions.length - Object.keys(responses).length;
    if (left > 0 && !confirm(`${left} question(s) not answered. Submit anyway?`)) return;
    submitBtn.disabled = true;
    submitBtn.textContent = "Marking…";
    try {
      const result = await cfg.submit(responses);
      store.del(cfg.saveKey);
      showReview({ title: cfg.title, questions, responses, result, backHref: cfg.backHref });
    } catch (e) {
      toast(errMsg(e), "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit answers";
    }
  });
  mount(page);
}

/** Show marked answers (or just the score when answers are not yet released). */
export function showReview({ title, questions, responses, result, backHref = "#/", note }) {
  const page = el("section", { class: "quiz" });
  page.append(el("h1", {}, title));
  page.append(el("div", { class: "scorebox" }, [
    el("div", { class: "score" }, `${result.score} / ${result.total}`),
    el("div", { class: "muted" }, result.total ? `${Math.round((100 * result.score) / result.total)}%` : ""),
  ]));
  if (note) page.append(el("p", { class: "muted" }, note));
  if (!result.revealed) {
    page.append(el("p", { class: "notice" },
      `Answers will be shown after the due date${result.dueAt ? ` (${fmtDate(result.dueAt)})` : ""}.`));
  }
  questions.forEach((q, i) => page.append(renderQuestion(q, {
    number: i + 1, selected: (responses || {})[q.id],
    review: result.revealed ? { answer: result.answers[q.id], correct: result.correct[q.id] } : { answer: null },
  })));
  page.append(el("p", {}, el("a", { class: "btn", href: backHref }, "Back")));
  mount(page);
}
