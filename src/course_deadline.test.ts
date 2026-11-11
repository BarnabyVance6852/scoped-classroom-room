import { assessDeadline } from "./course_deadline.ts";

const result = assessDeadline({
  learnerId: "learner-17",
  deadline: "2026-10-01T09:00:00Z",
  observedAt: "2026-10-01T09:05:00Z"
});

if (result !== "late") {
  throw new Error(`Expected late, received ${result}`);
}

console.log("course deadline decision: late");
