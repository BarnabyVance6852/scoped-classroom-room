export type DeadlineState = "late" | "on-time";

export type DeadlineObservation = {
  learnerId: string;
  deadline: string;
  observedAt: string;
};

export function assessDeadline(input: DeadlineObservation): DeadlineState {
  const deadline = Date.parse(input.deadline);
  const observedAt = Date.parse(input.observedAt);
  if (!input.learnerId || Number.isNaN(deadline) || Number.isNaN(observedAt)) {
    throw new Error("A learner and two ISO timestamps are required");
  }
  return observedAt > deadline ? "late" : "on-time";
}
