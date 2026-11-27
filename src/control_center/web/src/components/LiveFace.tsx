/**
 * @file An employee's face wherever they are named, moving with what they are doing right now
 * (spec 7.13, "What alive looks like").
 *
 * Cards and filters often know only who an employee is, not their live state. These read it from
 * the Directory, which the event stream keeps current, so a face on a thread, an approval or a
 * filter chip sleeps, thinks, writes or waits exactly as it does in the Directory. Until the
 * Directory has loaded, or for someone it does not list, the face shows the fallback state; a face
 * whose department is not known either is left out rather than guessed.
 */
import { useDirectory } from "../api/queries";
import type { Department, Employee, EmployeeState } from "../api/types";
import { Avatar } from "./Avatar";

/** Each employee by name, from the Directory. */
function useEmployees(): Map<string, Employee> {
  const employees = useDirectory().data?.employees ?? [];
  return new Map(employees.map((employee) => [employee.name, employee]));
}

interface Face {
  name: string;
  department: Department;
}

/** One employee's face in their live state; the department may come from the Directory. */
export function LiveAvatar({
  name,
  department,
  size = 32,
  fallback = "idle",
  idleAs,
}: {
  name: string;
  department?: Department;
  size?: number;
  fallback?: EmployeeState;
  /** What an idle employee is really doing here, such as waiting on the Owner's answer. */
  idleAs?: EmployeeState;
}) {
  const employee = useEmployees().get(name);
  const dept = department ?? employee?.department;
  if (!dept) return null;
  const live = employee?.state ?? fallback;
  const state = live === "idle" && idleAs ? idleAs : live;
  return <Avatar department={dept} state={state} name={name} size={size} />;
}

/** Several faces overlapping, each in its live state, with a count for any beyond `max`. */
export function AvatarGroup({
  faces,
  size = 24,
  max = 4,
}: {
  faces: Face[];
  size?: number;
  max?: number;
}) {
  const employees = useEmployees();
  const extra = faces.length - max;
  return (
    <span className="avatar-group" style={{ ["--avatar-size" as string]: `${size}px` }}>
      {faces.slice(0, max).map((face) => (
        <Avatar
          key={face.name}
          department={face.department}
          state={employees.get(face.name)?.state ?? "idle"}
          name={face.name}
          size={size}
        />
      ))}
      {extra > 0 && <span className="avatar-more mono">+{extra}</span>}
    </span>
  );
}
