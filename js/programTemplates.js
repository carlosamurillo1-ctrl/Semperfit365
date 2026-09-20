// Prebuilt whole-program templates a coach can load onto a device in one
// tap, replacing whatever program is currently there. Used by the
// "Program templates" screen (see app.js) so a coach can hand a client a
// completely different program (e.g. a leg/glute-focused plan) without
// rebuilding it day-by-day in the UI.
import { SEED_SHEET_TEXT } from "./seedProgram.js";

const LEG_GLUTE_FOCUS_TEXT = `	Workout A

	Barbell Squats			Rep goal: 8-10 reps			Rest time: 2-3 min.

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

	Barbell Hip Thrusts			Rep goal: 6-10 reps			Rest time: 2-3 min.

	Week	Set 1	Set 2	Set 3			Notes

1	WEEK 1
2	WEEK 2
3	WEEK 3
4	WEEK 4
5	WEEK 5
6	WEEK 6
7	WEEK 7
8	WEEK 8

	Romanian Deadlift			Rep goal: 6-8 reps			Rest time: 2-3 min.

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
];
