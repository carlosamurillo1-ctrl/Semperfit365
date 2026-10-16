// Prebuilt whole-program templates a coach can load onto a device in one
// tap, replacing whatever program is currently there. Used by the
// "Program templates" screen (see app.js) so a coach can hand a client a
// completely different program (e.g. a leg/glute-focused plan) without
// rebuilding it day-by-day in the UI.
import { SEED_SHEET_TEXT } from "./seedProgram.js";

const LEG_GLUTE_FOCUS_TEXT = `	Workout A

	Barbell Squats			Rep goal: 8-10 reps			Rest time: 90 sec

	Perform 1 warm-up set of 6-10 reps using lighter weight

	Week	Set 1	Set 2	Set 3			Notes

1	WEEK 1
2	WEEK 2
3	WEEK 3
4	WEEK 4
5	WEEK 5
6	WEEK 6
7	WEEK 7
8	WEEK 8

	Barbell Reverse Lunges			Rep goal: 8-10 reps per leg			Rest time: 90 sec

	Week	Set 1	Set 2	Set 3			Notes

1	WEEK 1
2	WEEK 2
3	WEEK 3
4	WEEK 4
5	WEEK 5
6	WEEK 6
7	WEEK 7
8	WEEK 8

	Bulgarian Split Squats			Rep goal: 8-10 reps per leg			Rest time: 90 sec

	Week	Set 1	Set 2	Set 3			Notes

1	WEEK 1
2	WEEK 2
3	WEEK 3
4	WEEK 4
5	WEEK 5
6	WEEK 6
7	WEEK 7
8	WEEK 8

	Weighted Walking Lunges			Rep goal: 10-15 reps			Rest time: 90 sec

	Week	Set 1	Set 2	Set 3			Notes

1	WEEK 1
2	WEEK 2
3	WEEK 3
4	WEEK 4
5	WEEK 5
6	WEEK 6
7	WEEK 7
8	WEEK 8


	Workout B

	Lat Cable Pull Down			Rep goal: 10-15 reps			Rest time: 120 sec

	Week	Set 1	Set 2	Set 3			Notes

1	WEEK 1
2	WEEK 2
3	WEEK 3
4	WEEK 4
5	WEEK 5
6	WEEK 6
7	WEEK 7
8	WEEK 8

	Incline DB Chest Press			Rep goal: 10-15 reps			Rest time: 120 sec

	Week	Set 1	Set 2	Set 3			Notes

1	WEEK 1
2	WEEK 2
3	WEEK 3
4	WEEK 4
5	WEEK 5
6	WEEK 6
7	WEEK 7
8	WEEK 8

	Cable Rows			Rep goal: 10-15 reps			Rest time: 120 sec

	Week	Set 1	Set 2	Set 3			Notes

1	WEEK 1
2	WEEK 2
3	WEEK 3
4	WEEK 4
5	WEEK 5
6	WEEK 6
7	WEEK 7
8	WEEK 8

	Lateral Raises			Rep goal: 10-15 reps			Rest time: 120 sec

	Week	Set 1	Set 2	Set 3			Notes

1	WEEK 1
2	WEEK 2
3	WEEK 3
4	WEEK 4
5	WEEK 5
6	WEEK 6
7	WEEK 7
8	WEEK 8

	Cable Bicep Curls			Rep goal: 10-15 reps			Rest time: 120 sec

	Week	Set 1	Set 2	Set 3			Notes

1	WEEK 1
2	WEEK 2
3	WEEK 3
4	WEEK 4
5	WEEK 5
6	WEEK 6
7	WEEK 7
8	WEEK 8

	Tricep Push Down			Rep goal: 10-15 reps			Rest time: 120 sec

	Week	Set 1	Set 2	Set 3			Notes

1	WEEK 1
2	WEEK 2
3	WEEK 3
4	WEEK 4
5	WEEK 5
6	WEEK 6
7	WEEK 7
8	WEEK 8

	Hip Abduction			Rep goal: 10-15 reps			Rest time: 120 sec

	Week	Set 1	Set 2	Set 3			Notes

1	WEEK 1
2	WEEK 2
3	WEEK 3
4	WEEK 4
5	WEEK 5
6	WEEK 6
7	WEEK 7
8	WEEK 8

	Hip Adduction			Rep goal: 10-15 reps			Rest time: 120 sec

	Week	Set 1	Set 2	Set 3			Notes

1	WEEK 1
2	WEEK 2
3	WEEK 3
4	WEEK 4
5	WEEK 5
6	WEEK 6
7	WEEK 7
8	WEEK 8


	Workout C

	Barbell Hip Thrusts			Rep goal: 6-10 reps			Rest time: 90 sec

	Week	Set 1	Set 2	Set 3			Notes

1	WEEK 1
2	WEEK 2
3	WEEK 3
4	WEEK 4
5	WEEK 5
6	WEEK 6
7	WEEK 7
8	WEEK 8

	Romanian Deadlift			Rep goal: 6-8 reps			Rest time: 90 sec

	Perform 1 warm-up set of 6-10 reps using lighter weight

	Week	Set 1	Set 2	Set 3			Notes

1	WEEK 1
2	WEEK 2
3	WEEK 3
4	WEEK 4
5	WEEK 5
6	WEEK 6
7	WEEK 7
8	WEEK 8

	Back Extension			Rep goal: 8-15 reps			Rest time: 90 sec

	Week	Set 1	Set 2	Set 3			Notes

1	WEEK 1
2	WEEK 2
3	WEEK 3
4	WEEK 4
5	WEEK 5
6	WEEK 6
7	WEEK 7
8	WEEK 8

	Cable Kickbacks			Rep goal: 10-15 reps			Rest time: 90 sec

	Week	Set 1	Set 2	Set 3			Notes

1	WEEK 1
2	WEEK 2
3	WEEK 3
4	WEEK 4
5	WEEK 5
6	WEEK 6
7	WEEK 7
8	WEEK 8

	Weighted Side-Lying Glute Raises			Rep goal: 10-15 reps			Rest time: 90 sec

	Week	Set 1	Set 2	Set 3			Notes

1	WEEK 1
2	WEEK 2
3	WEEK 3
4	WEEK 4
5	WEEK 5
6	WEEK 6
7	WEEK 7
8	WEEK 8
`;

const PHASE_1_UPPER_TEXT = `	Semperfit Training - Phase 1 - (WORKOUT A)

	Chest Press Machine			Rep goal: 10-15 reps			Rest time: 2-3 min.

	Week	Set 1	Set 2	Set 3	Set 4		Notes	https://youtu.be/7RIQM35eoeg?si=wwdI3MZj58jEnI1e

1	WEEK 1
2	WEEK 2
3	WEEK 3
4	WEEK 4
5	WEEK 5
6	WEEK 6
7	WEEK 7
8	WEEK 8

	Chest Fly Machine			Rep goal: 10-12 reps			Rest time: 2-3 min.

	Perform 2-3 warm-up sets of 6 reps using the easier exercise progressions.

	Week	Set 1	Set 2	Set 3	Set 4		Notes	https://youtu.be/jiitI2ma3J4?si=pR1y33ds2ZnhXO4J

1	WEEK 1
2	WEEK 2
3	WEEK 3
4	WEEK 4
5	WEEK 5
6	WEEK 6
7	WEEK 7
8	WEEK 8

	Tricep Pushdown Rope			Rep goal: 15-20 reps			Rest time: 2-3 min.

	Week	Set 1	Set 2	Set 3	Set 4		Notes	https://youtu.be/nMqQNGo4Jtg?si=ZeWdYXmHm5m42z8J

1	WEEK 1
2	WEEK 2
3	WEEK 3
4	WEEK 4
5	WEEK 5
6	WEEK 6
7	WEEK 7
8	WEEK 8

	Incline Chest Press Machine			Rep goal: 10-15 reps			Rest time: 40 sec.

	Week	Set 1	Set 2	Set 3	Set 4		Notes

1	WEEK 1
2	WEEK 2
3	WEEK 3
4	WEEK 4
5	WEEK 5
6	WEEK 6
7	WEEK 7
8	WEEK 8

	Incline Lateral Raises			Rep goal: 10-15 reps			Rest time: Rest Pause 15 sec.

	Week	Set 1	Set 2	Set 3	Set 4		Notes	https://youtu.be/LdTnsPjbzzU?si=D2dtgS3p1kYdy7xN

1	WEEK 1
2	WEEK 2
3	WEEK 3
4	WEEK 4
5	WEEK 5
6	WEEK 6
7	WEEK 7
8	WEEK 8

	Hollow Body Hold			Rep goal: 30 seconds

	Core circuit - all five moves back to back, no rest between them. Four rounds, one per column.

	Week	Set 1	Set 2	Set 3	Set 4		Notes

1	WEEK 1
2	WEEK 2
3	WEEK 3
4	WEEK 4
5	WEEK 5
6	WEEK 6
7	WEEK 7
8	WEEK 8

	Bicycle Crunches			Rep goal: 45 seconds

	Week	Set 1	Set 2	Set 3	Set 4		Notes

1	WEEK 1
2	WEEK 2
3	WEEK 3
4	WEEK 4
5	WEEK 5
6	WEEK 6
7	WEEK 7
8	WEEK 8

	Side Plank			Rep goal: 45 seconds each side

	Week	Set 1	Set 2	Set 3	Set 4		Notes

1	WEEK 1
2	WEEK 2
3	WEEK 3
4	WEEK 4
5	WEEK 5
6	WEEK 6
7	WEEK 7
8	WEEK 8

	Weighted Overhead Walk or March			Rep goal: 1 minute each side

	Week	Set 1	Set 2	Set 3	Set 4		Notes

1	WEEK 1
2	WEEK 2
3	WEEK 3
4	WEEK 4
5	WEEK 5
6	WEEK 6
7	WEEK 7
8	WEEK 8

	Reverse Crunches			Rep goal: 15 reps

	Week	Set 1	Set 2	Set 3	Set 4		Notes

1	WEEK 1
2	WEEK 2
3	WEEK 3
4	WEEK 4
5	WEEK 5
6	WEEK 6
7	WEEK 7
8	WEEK 8

	Semperfit Training - Phase 1 - (WORKOUT B)

	Abduction and Adduction Machine			Rep goal: 15-20 reps			Rest time: 2-3 min.

	Perform 2 warm-up sets of 6 reps.

	Week	Set 1	Set 2	Set 3	Set 4		Notes

1	WEEK 1
2	WEEK 2
3	WEEK 3
4	WEEK 4
5	WEEK 5
6	WEEK 6
7	WEEK 7
8	WEEK 8

	Row Machine			Rep goal: 10-15 reps			Rest time: 2-3 min.

	Week	Set 1	Set 2	Set 3	Set 4		Notes

1	WEEK 1
2	WEEK 2
3	WEEK 3
4	WEEK 4
5	WEEK 5
6	WEEK 6
7	WEEK 7
8	WEEK 8

	Lat Pull Down Machine			Rep goal: 10-15 reps			Rest time: Rest Pause (15s)

	Week	Set 1	Set 2	Set 3	Set 4		Notes

1	WEEK 1
2	WEEK 2
3	WEEK 3
4	WEEK 4
5	WEEK 5
6	WEEK 6
7	WEEK 7
8	WEEK 8

	Dumbbell Bicep Iso Curl			Rep goal: 10-15 reps			Rest time: 40 secs

	Week	Set 1	Set 2	Set 3	Set 4		Notes

1	WEEK 1
2	WEEK 2
3	WEEK 3
4	WEEK 4
5	WEEK 5
6	WEEK 6
7	WEEK 7
8	WEEK 8

	Single Arm Kneeling High to Low Row			Rep goal: 10-15 reps			Rest time: Rest Pause 15 sec.

	Week	Set 1	Set 2	Set 3	Set 4		Notes

1	WEEK 1
2	WEEK 2
3	WEEK 3
4	WEEK 4
5	WEEK 5
6	WEEK 6
7	WEEK 7
8	WEEK 8

	Plank on Stability Ball			Rep goal: 1 minute

	Core circuit - all five moves back to back, no rest between them. Four rounds, one per column.

	Week	Set 1	Set 2	Set 3	Set 4		Notes

1	WEEK 1
2	WEEK 2
3	WEEK 3
4	WEEK 4
5	WEEK 5
6	WEEK 6
7	WEEK 7
8	WEEK 8

	Hollow Dead Bug, Alternating			Rep goal: 10 reps

	Week	Set 1	Set 2	Set 3	Set 4		Notes

1	WEEK 1
2	WEEK 2
3	WEEK 3
4	WEEK 4
5	WEEK 5
6	WEEK 6
7	WEEK 7
8	WEEK 8

	Side Plank			Rep goal: 45 seconds each side

	Week	Set 1	Set 2	Set 3	Set 4		Notes

1	WEEK 1
2	WEEK 2
3	WEEK 3
4	WEEK 4
5	WEEK 5
6	WEEK 6
7	WEEK 7
8	WEEK 8

	Slow Mountain Climbers			Rep goal: 30 seconds

	Week	Set 1	Set 2	Set 3	Set 4		Notes

1	WEEK 1
2	WEEK 2
3	WEEK 3
4	WEEK 4
5	WEEK 5
6	WEEK 6
7	WEEK 7
8	WEEK 8

	Leg Raises			Rep goal: 12-15 reps

	Week	Set 1	Set 2	Set 3	Set 4		Notes

1	WEEK 1
2	WEEK 2
3	WEEK 3
4	WEEK 4
5	WEEK 5
6	WEEK 6
7	WEEK 7
8	WEEK 8
`;

export const PROGRAM_TEMPLATES = [
  {
    id: "default",
    name: "Default Program",
    description: "Workout A/B/C/D — balanced push/pull split with a dedicated arm day.",
    sheetText: SEED_SHEET_TEXT,
  },
  {
    id: "leg-glute-focus",
    name: "Leg & Glute Focus",
    description: "Workout A/B/C — mostly lower body and glutes, one upper-body day (with hip abduction/adduction).",
    sheetText: LEG_GLUTE_FOCUS_TEXT,
  },
  {
    id: "phase-1-upper",
    name: "Semperfit Phase 1 — Upper A/B",
    description: "Workout A/B — two upper-body days, each finishing with a five-move core circuit run for four rounds.",
    sheetText: PHASE_1_UPPER_TEXT,
  },
];
