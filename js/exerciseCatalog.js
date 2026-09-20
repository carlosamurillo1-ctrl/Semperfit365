// A starter catalog of common exercises, grouped by muscle group and tagged
// with the equipment they use. Merged into the exercise library on boot
// (see Store.seedLibraryCatalog in app.js) -- it never overwrites or
// duplicates anything already in the library by name, so a coach's own
// custom exercises are always left alone.
//
// No video links are included here on purpose: there's no safe way for a
// static site to look up real YouTube videos automatically (see the
// "Find on YouTube" button on the exercise screen for that instead).

export const MUSCLE_GROUPS = ["Chest", "Back", "Legs", "Calves", "Biceps", "Triceps", "Shoulders"];

export const EXERCISE_CATALOG = [
  // ---- Chest ----
  { name: "Barbell Bench Press", muscleGroup: "Chest", equipment: "Barbell" },
  { name: "Decline Barbell Bench Press", muscleGroup: "Chest", equipment: "Barbell" },
  { name: "Landmine Chest Press", muscleGroup: "Chest", equipment: "Barbell" },
  { name: "Decline Dumbbell Bench Press", muscleGroup: "Chest", equipment: "Dumbbell" },
  { name: "Flat Dumbbell Flyes", muscleGroup: "Chest", equipment: "Dumbbell" },
  { name: "Dumbbell Pullover", muscleGroup: "Chest", equipment: "Dumbbell" },
  { name: "Single-Arm Dumbbell Bench Press", muscleGroup: "Chest", equipment: "Dumbbell" },
  { name: "Svend Press", muscleGroup: "Chest", equipment: "Dumbbell" },
  { name: "Standing Cable Chest Fly", muscleGroup: "Chest", equipment: "Cable" },
  { name: "Cable Crossover", muscleGroup: "Chest", equipment: "Cable" },
  { name: "Push-ups", muscleGroup: "Chest", equipment: "Bodyweight" },
  { name: "Incline Push-ups", muscleGroup: "Chest", equipment: "Bodyweight" },
  { name: "Decline Push-ups", muscleGroup: "Chest", equipment: "Bodyweight" },
  { name: "Diamond Push-ups", muscleGroup: "Chest", equipment: "Bodyweight" },
  { name: "Chest Dips", muscleGroup: "Chest", equipment: "Bodyweight" },
  { name: "Resistance Band Chest Press", muscleGroup: "Chest", equipment: "Band" },
  { name: "Resistance Band Chest Fly", muscleGroup: "Chest", equipment: "Band" },

  // ---- Back ----
  { name: "Barbell Bent-Over Row", muscleGroup: "Back", equipment: "Barbell" },
  { name: "Pendlay Row", muscleGroup: "Back", equipment: "Barbell" },
  { name: "T-Bar Row", muscleGroup: "Back", equipment: "Barbell" },
  { name: "Deadlift", muscleGroup: "Back", equipment: "Barbell" },
  { name: "Sumo Deadlift", muscleGroup: "Back", equipment: "Barbell" },
  { name: "Rack Pull", muscleGroup: "Back", equipment: "Barbell" },
  { name: "Single-Arm Dumbbell Row", muscleGroup: "Back", equipment: "Dumbbell" },
  { name: "Chest-Supported Dumbbell Row", muscleGroup: "Back", equipment: "Dumbbell" },
  { name: "Renegade Row", muscleGroup: "Back", equipment: "Dumbbell" },
  { name: "Kettlebell Row", muscleGroup: "Back", equipment: "Kettlebell" },
  { name: "Kettlebell High Pull", muscleGroup: "Back", equipment: "Kettlebell" },
  { name: "Pull-ups", muscleGroup: "Back", equipment: "Bodyweight" },
  { name: "Chin-ups", muscleGroup: "Back", equipment: "Bodyweight" },
  { name: "Inverted Row", muscleGroup: "Back", equipment: "Bodyweight" },
  { name: "Superman", muscleGroup: "Back", equipment: "Bodyweight" },
  { name: "Resistance Band Row", muscleGroup: "Back", equipment: "Band" },
  { name: "Resistance Band Pull-Apart", muscleGroup: "Back", equipment: "Band" },
  { name: "Straight-Arm Cable Pulldown", muscleGroup: "Back", equipment: "Cable" },
  { name: "Seated Cable Row", muscleGroup: "Back", equipment: "Cable" },

  // ---- Legs ----
  { name: "Front Squat", muscleGroup: "Legs", equipment: "Barbell" },
  { name: "Sumo Squat", muscleGroup: "Legs", equipment: "Barbell" },
  { name: "Barbell Step-Up", muscleGroup: "Legs", equipment: "Barbell" },
  { name: "Goblet Squat", muscleGroup: "Legs", equipment: "Dumbbell" },
  { name: "Dumbbell Step-Up", muscleGroup: "Legs", equipment: "Dumbbell" },
  { name: "Dumbbell Lateral Lunge", muscleGroup: "Legs", equipment: "Dumbbell" },
  { name: "Dumbbell Stiff-Leg Deadlift", muscleGroup: "Legs", equipment: "Dumbbell" },
  { name: "Kettlebell Goblet Squat", muscleGroup: "Legs", equipment: "Kettlebell" },
  { name: "Kettlebell Swing", muscleGroup: "Legs", equipment: "Kettlebell" },
  { name: "Kettlebell Goblet Lunge", muscleGroup: "Legs", equipment: "Kettlebell" },
  { name: "Bodyweight Squat", muscleGroup: "Legs", equipment: "Bodyweight" },
  { name: "Jump Squat", muscleGroup: "Legs", equipment: "Bodyweight" },
  { name: "Walking Lunge", muscleGroup: "Legs", equipment: "Bodyweight" },
  { name: "Wall Sit", muscleGroup: "Legs", equipment: "Bodyweight" },
  { name: "Pistol Squat", muscleGroup: "Legs", equipment: "Bodyweight" },
  { name: "Glute Bridge", muscleGroup: "Legs", equipment: "Bodyweight" },
  { name: "Single-Leg Glute Bridge", muscleGroup: "Legs", equipment: "Bodyweight" },
  { name: "Resistance Band Squat", muscleGroup: "Legs", equipment: "Band" },
  { name: "Resistance Band Lateral Walk", muscleGroup: "Legs", equipment: "Band" },
  { name: "Resistance Band Glute Bridge", muscleGroup: "Legs", equipment: "Band" },

  // ---- Calves ----
  { name: "Standing Barbell Calf Raise", muscleGroup: "Calves", equipment: "Barbell" },
  { name: "Dumbbell Calf Raise", muscleGroup: "Calves", equipment: "Dumbbell" },
  { name: "Seated Dumbbell Calf Raise", muscleGroup: "Calves", equipment: "Dumbbell" },
  { name: "Single-Leg Dumbbell Calf Raise", muscleGroup: "Calves", equipment: "Dumbbell" },
  { name: "Kettlebell Calf Raise", muscleGroup: "Calves", equipment: "Kettlebell" },
  { name: "Bodyweight Calf Raise", muscleGroup: "Calves", equipment: "Bodyweight" },
  { name: "Single-Leg Calf Raise", muscleGroup: "Calves", equipment: "Bodyweight" },
  { name: "Calf Raise Jump", muscleGroup: "Calves", equipment: "Bodyweight" },
  { name: "Donkey Calf Raise", muscleGroup: "Calves", equipment: "Bodyweight" },
  { name: "Resistance Band Calf Raise", muscleGroup: "Calves", equipment: "Band" },

  // ---- Biceps ----
  { name: "Barbell Curl", muscleGroup: "Biceps", equipment: "Barbell" },
  { name: "EZ-Bar Curl", muscleGroup: "Biceps", equipment: "Barbell" },
  { name: "Barbell Drag Curl", muscleGroup: "Biceps", equipment: "Barbell" },
  { name: "21s Bicep Curl", muscleGroup: "Biceps", equipment: "Barbell" },
  { name: "Dumbbell Bicep Curl", muscleGroup: "Biceps", equipment: "Dumbbell" },
  { name: "Alternating Dumbbell Curl", muscleGroup: "Biceps", equipment: "Dumbbell" },
  { name: "Dumbbell Concentration Curl", muscleGroup: "Biceps", equipment: "Dumbbell" },
  { name: "Dumbbell Spider Curl", muscleGroup: "Biceps", equipment: "Dumbbell" },
  { name: "Cross-Body Hammer Curl", muscleGroup: "Biceps", equipment: "Dumbbell" },
  { name: "Zottman Curl", muscleGroup: "Biceps", equipment: "Dumbbell" },
  { name: "Kettlebell Bicep Curl", muscleGroup: "Biceps", equipment: "Kettlebell" },
  { name: "Resistance Band Bicep Curl", muscleGroup: "Biceps", equipment: "Band" },
  { name: "Cable Rope Hammer Curl", muscleGroup: "Biceps", equipment: "Cable" },

  // ---- Triceps ----
  { name: "Close-Grip Barbell Bench Press", muscleGroup: "Triceps", equipment: "Barbell" },
  { name: "Barbell Skull Crushers", muscleGroup: "Triceps", equipment: "Barbell" },
  { name: "Overhead Barbell Tricep Extension", muscleGroup: "Triceps", equipment: "Barbell" },
  { name: "Dumbbell Overhead Tricep Extension", muscleGroup: "Triceps", equipment: "Dumbbell" },
  { name: "Single-Arm Dumbbell Overhead Extension", muscleGroup: "Triceps", equipment: "Dumbbell" },
  { name: "Dumbbell Tricep Kickback", muscleGroup: "Triceps", equipment: "Dumbbell" },
  { name: "Kettlebell Tricep Extension", muscleGroup: "Triceps", equipment: "Kettlebell" },
  { name: "Bench Dip", muscleGroup: "Triceps", equipment: "Bodyweight" },
  { name: "Close-Grip Push-up", muscleGroup: "Triceps", equipment: "Bodyweight" },
  { name: "Resistance Band Tricep Extension", muscleGroup: "Triceps", equipment: "Band" },
  { name: "Resistance Band Pushdown", muscleGroup: "Triceps", equipment: "Band" },
  { name: "Cable Tricep Kickback", muscleGroup: "Triceps", equipment: "Cable" },

  // ---- Shoulders ----
  { name: "Standing Barbell Overhead Press", muscleGroup: "Shoulders", equipment: "Barbell" },
  { name: "Push Press", muscleGroup: "Shoulders", equipment: "Barbell" },
  { name: "Barbell Upright Row", muscleGroup: "Shoulders", equipment: "Barbell" },
  { name: "Dumbbell Shoulder Press", muscleGroup: "Shoulders", equipment: "Dumbbell" },
  { name: "Arnold Press", muscleGroup: "Shoulders", equipment: "Dumbbell" },
  { name: "Dumbbell Front Raise", muscleGroup: "Shoulders", equipment: "Dumbbell" },
  { name: "Dumbbell Rear Delt Fly", muscleGroup: "Shoulders", equipment: "Dumbbell" },
  { name: "Dumbbell Upright Row", muscleGroup: "Shoulders", equipment: "Dumbbell" },
  { name: "Kettlebell Shoulder Press", muscleGroup: "Shoulders", equipment: "Kettlebell" },
  { name: "Kettlebell Halo", muscleGroup: "Shoulders", equipment: "Kettlebell" },
  { name: "Pike Push-up", muscleGroup: "Shoulders", equipment: "Bodyweight" },
  { name: "Handstand Push-up", muscleGroup: "Shoulders", equipment: "Bodyweight" },
  { name: "Resistance Band Lateral Raise", muscleGroup: "Shoulders", equipment: "Band" },
  { name: "Resistance Band Front Raise", muscleGroup: "Shoulders", equipment: "Band" },
  { name: "Resistance Band Face Pull", muscleGroup: "Shoulders", equipment: "Band" },
  { name: "Cable Lateral Raise", muscleGroup: "Shoulders", equipment: "Cable" },
  { name: "Cable Front Raise", muscleGroup: "Shoulders", equipment: "Cable" },
];
