import { redirect } from "next/navigation";
import { getScope } from "@/lib/scope";
import { defaultStudent } from "@/lib/queries/student";

/** The "Student" role tab opens a representative flagged student in the current scope. */
export default async function StudentIndex() {
  const scope = await getScope();
  if (scope.role === "board") redirect("/board");
  const id = defaultStudent(scope);
  if (!id) redirect("/district/students");
  redirect(`/student/${id}`);
}
