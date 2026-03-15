import { NextRequest, NextResponse } from "next/server";
import { SPORTS } from "@/lib/types/enums";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":
    process.env.NODE_ENV === "production"
      ? "https://buildalphakids.com.au"
      : "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const SPORT_DETAILS: Record<
  string,
  { description: string; icon: string }
> = {
  Soccer: { description: "Build teamwork and coordination through the world's most popular sport.", icon: "Goal" },
  Basketball: { description: "Develop ball handling, shooting, and court awareness.", icon: "Target" },
  Athletics: { description: "Running, jumping, and throwing fundamentals for all ages.", icon: "Timer" },
  Yoga: { description: "Mindfulness, flexibility, and balance through fun poses.", icon: "Flower2" },
  Pilates: { description: "Core strength and body awareness exercises for young athletes.", icon: "Dumbbell" },
  "Boot Camp": { description: "High-energy fitness circuits to build strength and endurance.", icon: "Flame" },
  Swimming: { description: "Water confidence, stroke technique, and water safety.", icon: "Waves" },
  Pickleball: { description: "Fast-growing paddle sport combining tennis, badminton, and table tennis.", icon: "Zap" },
  Golf: { description: "Introduction to golf fundamentals, putting, and course etiquette.", icon: "Flag" },
  Hockey: { description: "Stick skills, teamwork, and game strategy on the field.", icon: "Swords" },
  Lacrosse: { description: "Catching, throwing, and cradling with a focus on team play.", icon: "Shield" },
  "Motor Skills": { description: "Foundational movement skills for younger children (3-5 years).", icon: "Baby" },
  "Multi-Sport": { description: "A rotation of different sports to build versatile athletes.", icon: "Trophy" },
  Cricket: { description: "Batting, bowling, and fielding skills in a team environment.", icon: "Circle" },
  Netball: { description: "Passing, shooting, and positional play for court confidence.", icon: "Users" },
  Tennis: { description: "Racquet skills, footwork, and rally techniques.", icon: "Racquet" },
  Volleyball: { description: "Serving, passing, and teamwork on the court.", icon: "Volleyball" },
  Dance: { description: "Rhythm, coordination, and creative expression through movement.", icon: "Music" },
  Gymnastics: { description: "Flexibility, balance, and body control through apparatus and floor work.", icon: "Sparkles" },
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(_request: NextRequest) {
  const sports = SPORTS.map((sport) => ({
    name: sport,
    description: SPORT_DETAILS[sport]?.description ?? "",
    icon: SPORT_DETAILS[sport]?.icon ?? "Activity",
  }));

  return NextResponse.json(
    { sports },
    {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Cache-Control": "public, max-age=86400",
      },
    }
  );
}
