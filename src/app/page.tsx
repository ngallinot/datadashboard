import { redirect } from "next/navigation";
import { getScope } from "@/lib/scope";

const HOME = { csiu: "/regional", district: "/district", board: "/board", teacher: "/teacher", student: "/student" } as const;

export default async function Home() {
  const scope = await getScope();
  redirect(HOME[scope.role]);
}
