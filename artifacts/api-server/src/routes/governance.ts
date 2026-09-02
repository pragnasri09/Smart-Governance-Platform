import { Router, type IRouter, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { pool } from "@workspace/db";
import {
  CreateComplaintBody,
  CreateDepartmentBody,
  GetComplaintParams,
  ListComplaintsQueryParams,
  ListMyComplaintsQueryParams,
  ListAssignedComplaintsQueryParams,
  ListUsersQueryParams,
  LoginBody,
  RegisterBody,
  SubmitContactBody,
  UpdateComplaintStatusBody,
  UpdateComplaintStatusParams,
  UpdateDepartmentBody,
  UpdateDepartmentParams,
} from "@workspace/api-zod";
import { allowRoles, createToken, getSessionUser, requireAuth, type Role } from "../lib/auth";

const router: IRouter = Router();

type QueryRow = Record<string, unknown>;
type SessionRequest = Request & { user: { id: number; role: Role; email: string; name: string } };
type DatabaseError = { code?: string };

function isUniqueViolation(error: unknown) {
  return (error as DatabaseError)?.code === "23505";
}

function session(req: Request) {
  return getSessionUser(req);
}

function iso(value: unknown) {
  return value ? new Date(String(value)).toISOString() : new Date().toISOString();
}

function userDto(row: QueryRow) {
  return {
    id: Number(row.id),
    name: String(row.name),
    email: String(row.email),
    role: row.role as Role,
    departmentId: row.department_id == null ? null : Number(row.department_id),
    departmentName: row.department_name == null ? null : String(row.department_name),
    createdAt: iso(row.created_at),
  };
}

function complaintDto(row: QueryRow) {
  return {
    id: Number(row.id),
    reference: String(row.reference),
    title: String(row.title),
    category: String(row.category),
    description: String(row.description),
    location: String(row.location),
    status: row.status,
    citizenId: Number(row.citizen_id),
    citizenName: String(row.citizen_name),
    departmentId: Number(row.department_id),
    departmentName: String(row.department_name),
    assignedStaffId: row.assigned_staff_id == null ? null : Number(row.assigned_staff_id),
    assignedStaffName: row.assigned_staff_name == null ? null : String(row.assigned_staff_name),
    remarks: row.remarks == null ? null : String(row.remarks),
    resolution: row.resolution == null ? null : String(row.resolution),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function departmentDto(row: QueryRow) {
  return {
    id: Number(row.id),
    name: String(row.name),
    description: String(row.description),
    active: Boolean(row.active),
    createdAt: iso(row.created_at),
  };
}

async function findUser(id: number) {
  const result = await pool.query(
    `SELECT u.id, u.name, u.email, u.role, u.department_id, u.created_at, d.name AS department_name
     FROM users u LEFT JOIN departments d ON d.id = u.department_id WHERE u.id = $1`,
    [id],
  );
  return result.rows[0] as QueryRow | undefined;
}

async function complaintQuery(where = "", params: unknown[] = [], order = "c.created_at DESC") {
  const result = await pool.query(
    `SELECT c.*, citizen.name AS citizen_name, d.name AS department_name,
            staff.name AS assigned_staff_name
     FROM complaints c
     JOIN users citizen ON citizen.id = c.citizen_id
     JOIN departments d ON d.id = c.department_id
     LEFT JOIN users staff ON staff.id = c.assigned_staff_id
     WHERE 1 = 1 ${where} ORDER BY ${order}`,
    params,
  );
  return result.rows.map(complaintDto);
}

function addComplaintFilters(query: { search?: string; status?: string; departmentId?: number }, start = 0) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  let index = start;
  if (query.search) {
    index += 1;
    clauses.push(`AND (c.reference ILIKE $${index} OR c.title ILIKE $${index} OR citizen.name ILIKE $${index})`);
    params.push(`%${query.search}%`);
  }
  if (query.status) {
    index += 1;
    clauses.push(`AND c.status = $${index}`);
    params.push(query.status);
  }
  if (query.departmentId) {
    index += 1;
    clauses.push(`AND c.department_id = $${index}`);
    params.push(query.departmentId);
  }
  return { where: clauses.join(" "), params };
}

async function notify(userId: number, message: string, complaintId: number | null) {
  await pool.query(
    "INSERT INTO notifications (message, user_id, complaint_id) VALUES ($1, $2, $3)",
    [message, userId, complaintId],
  );
}

router.post("/auth/register", async (req, res) => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Please check the registration details and try again." });
    return;
  }
  const input = parsed.data;
  if (input.role === "STAFF" && !input.departmentId) {
    res.status(400).json({ error: "Staff registration requires a department." });
    return;
  }
  try {
    const passwordHash = await bcrypt.hash(input.password, 12);
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, department_id)
       VALUES ($1, LOWER($2), $3, $4, $5)
       RETURNING id`,
      [input.name.trim(), input.email.trim(), passwordHash, input.role, input.departmentId ?? null],
    );
    const row = await findUser(Number(result.rows[0].id));
    if (!row) throw new Error("User was not created");
    const user = userDto(row);
    const token = createToken({ id: user.id, role: user.role, email: user.email, name: user.name });
    res.status(201).json({ token, user });
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "An account with this email already exists." });
      return;
    }
    res.status(500).json({ error: "We could not create your account right now." });
  }
});

router.post("/auth/login", async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid email and password." });
    return;
  }
  const result = await pool.query(
    `SELECT u.*, d.name AS department_name FROM users u
     LEFT JOIN departments d ON d.id = u.department_id WHERE LOWER(u.email) = LOWER($1)`,
    [parsed.data.email.trim()],
  );
  const row = result.rows[0] as QueryRow | undefined;
  if (!row || !(await bcrypt.compare(parsed.data.password, String(row.password_hash)))) {
    res.status(401).json({ error: "The email or password is incorrect." });
    return;
  }
  const user = userDto(row);
  const token = createToken({ id: user.id, role: user.role, email: user.email, name: user.name });
  res.json({ token, user });
});

router.get("/auth/me", requireAuth, async (req, res) => {
  const row = await findUser(session(req).id);
  if (!row) {
    res.status(401).json({ error: "Your account could not be found." });
    return;
  }
  res.json(userDto(row));
});

router.get("/users/profile", requireAuth, async (req, res) => {
  const row = await findUser(session(req).id);
  if (!row) {
    res.status(404).json({ error: "Profile not found." });
    return;
  }
  res.json(userDto(row));
});

router.get("/users", requireAuth, allowRoles("ADMIN"), async (req, res) => {
  const parsed = ListUsersQueryParams.safeParse(req.query);
  const query = parsed.success ? parsed.data : {};
  const params: unknown[] = [];
  const clauses: string[] = [];
  if (query.search) {
    params.push(`%${query.search}%`);
    clauses.push(`AND (u.name ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
  }
  if (query.role) {
    params.push(query.role);
    clauses.push(`AND u.role = $${params.length}`);
  }
  const result = await pool.query(
    `SELECT u.id, u.name, u.email, u.role, u.department_id, u.created_at, d.name AS department_name
     FROM users u LEFT JOIN departments d ON d.id = u.department_id
     WHERE 1 = 1 ${clauses.join(" ")} ORDER BY u.created_at DESC`,
    params,
  );
  res.json(result.rows.map(userDto));
});

router.get("/departments", requireAuth, async (_req, res) => {
  const result = await pool.query("SELECT * FROM departments WHERE active = true ORDER BY name");
  res.json(result.rows.map(departmentDto));
});

router.post("/departments", requireAuth, allowRoles("ADMIN"), async (req, res) => {
  const parsed = CreateDepartmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a department name and description." });
    return;
  }
  try {
    const result = await pool.query(
      "INSERT INTO departments (name, description) VALUES ($1, $2) RETURNING *",
      [parsed.data.name.trim(), parsed.data.description.trim()],
    );
    res.status(201).json(departmentDto(result.rows[0]));
  } catch (error) {
    res.status(isUniqueViolation(error) ? 409 : 500).json({
      error: isUniqueViolation(error)
        ? "A department with that name already exists."
        : "We could not create the department.",
    });
  }
});

router.put("/departments/:id", requireAuth, allowRoles("ADMIN"), async (req, res) => {
  const params = UpdateDepartmentParams.safeParse(req.params);
  const body = UpdateDepartmentBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Enter a department name and description." });
    return;
  }
  const result = await pool.query(
    "UPDATE departments SET name = $1, description = $2 WHERE id = $3 RETURNING *",
    [body.data.name.trim(), body.data.description.trim(), params.data.id],
  );
  if (!result.rows[0]) {
    res.status(404).json({ error: "Department not found." });
    return;
  }
  res.json(departmentDto(result.rows[0]));
});

router.delete("/departments/:id", requireAuth, allowRoles("ADMIN"), async (req, res) => {
  const params = UpdateDepartmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid department." });
    return;
  }
  await pool.query("UPDATE departments SET active = false WHERE id = $1", [params.data.id]);
  res.status(204).send();
});

router.post("/complaints", requireAuth, allowRoles("CITIZEN"), async (req, res) => {
  const parsed = CreateComplaintBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Please complete every complaint field before submitting." });
    return;
  }
  const department = await pool.query("SELECT id FROM departments WHERE id = $1 AND active = true", [
    parsed.data.departmentId,
  ]);
  if (!department.rows[0]) {
    res.status(400).json({ error: "Please choose an active department." });
    return;
  }
  const reference = `SGP-${Date.now().toString().slice(-8)}`;
  const result = await pool.query(
    `INSERT INTO complaints (reference, title, category, description, location, citizen_id, department_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [
      reference,
      parsed.data.title.trim(),
      parsed.data.category.trim(),
      parsed.data.description.trim(),
      parsed.data.location.trim(),
      session(req).id,
      parsed.data.departmentId,
    ],
  );
  await notify(session(req).id, `Complaint ${reference} was submitted successfully.`, Number(result.rows[0].id));
  const complaints = await complaintQuery("AND c.id = $1", [Number(result.rows[0].id)]);
  res.status(201).json(complaints[0]);
});

router.get("/complaints/my", requireAuth, allowRoles("CITIZEN"), async (req, res) => {
  const parsed = ListMyComplaintsQueryParams.safeParse(req.query);
  const query = parsed.success ? parsed.data : {};
  const filters = addComplaintFilters(query);
  const complaints = await complaintQuery(`AND c.citizen_id = $1 ${filters.where}`, [session(req).id, ...filters.params]);
  res.json(complaints);
});

router.get("/complaints/assigned", requireAuth, allowRoles("STAFF"), async (req, res) => {
  const parsed = ListAssignedComplaintsQueryParams.safeParse(req.query);
  const query = parsed.success ? parsed.data : {};
  const filters = addComplaintFilters(query, 1);
  const complaints = await complaintQuery(
    `AND c.assigned_staff_id = $1 ${filters.where}`,
    [session(req).id, ...filters.params],
  );
  res.json(complaints);
});

router.get("/complaints", requireAuth, allowRoles("STAFF", "ADMIN"), async (req, res) => {
  const parsed = ListComplaintsQueryParams.safeParse(req.query);
  const query = parsed.success ? parsed.data : {};
  const filters = addComplaintFilters(query);
  res.json(await complaintQuery(filters.where, filters.params));
});

router.get("/complaints/:id", requireAuth, async (req, res) => {
  const parsed = GetComplaintParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid complaint." });
    return;
  }
  const rows = await complaintQuery("AND c.id = $1", [parsed.data.id]);
  const complaint = rows[0];
  const current = session(req);
  if (!complaint || (current.role === "CITIZEN" && complaint.citizenId !== current.id) ||
      (current.role === "STAFF" && complaint.assignedStaffId !== current.id)) {
    res.status(404).json({ error: "Complaint not found." });
    return;
  }
  res.json(complaint);
});

router.put("/complaints/:id", requireAuth, allowRoles("STAFF", "ADMIN"), async (req, res) => {
  const params = UpdateComplaintStatusParams.safeParse(req.params);
  const body = UpdateComplaintStatusBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Please choose a valid status." });
    return;
  }
  const current = session(req);
  const existing = await complaintQuery("AND c.id = $1", [params.data.id]);
  if (!existing[0]) {
    res.status(404).json({ error: "Complaint not found." });
    return;
  }
  if (current.role === "STAFF" && existing[0].assignedStaffId !== current.id) {
    res.status(403).json({ error: "You can only update complaints assigned to you." });
    return;
  }
  const assignedStaffId = current.role === "ADMIN"
    ? body.data.assignedStaffId ?? existing[0].assignedStaffId
    : current.id;
  const result = await pool.query(
    `UPDATE complaints SET status = $1, remarks = $2, resolution = $3,
       assigned_staff_id = $4, updated_at = NOW() WHERE id = $5 RETURNING id`,
    [
      body.data.status,
      body.data.remarks ?? existing[0].remarks,
      body.data.resolution ?? existing[0].resolution,
      assignedStaffId,
      params.data.id,
    ],
  );
  const updated = (await complaintQuery("AND c.id = $1", [Number(result.rows[0].id)]))[0];
  await notify(updated.citizenId, `Complaint ${updated.reference} status changed to ${String(updated.status).replaceAll("_", " ").toLowerCase()}.`, updated.id);
  res.json(updated);
});

router.get("/notifications", requireAuth, async (req, res) => {
  const result = await pool.query(
    `SELECT n.id, n.message, n.complaint_id, c.reference AS complaint_reference, n.read, n.created_at
     FROM notifications n LEFT JOIN complaints c ON c.id = n.complaint_id
     WHERE n.user_id = $1 ORDER BY n.created_at DESC`,
    [session(req).id],
  );
  res.json(result.rows.map((row) => ({
    id: Number(row.id),
    message: String(row.message),
    complaintId: row.complaint_id == null ? null : Number(row.complaint_id),
    complaintReference: row.complaint_reference == null ? null : String(row.complaint_reference),
    read: Boolean(row.read),
    createdAt: iso(row.created_at),
  })));
});

router.post("/contact", async (req, res) => {
  const parsed = SubmitContactBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Please complete all contact fields." });
    return;
  }
  await pool.query(
    "INSERT INTO contact_messages (name, email, subject, message) VALUES ($1, $2, $3, $4)",
    [parsed.data.name.trim(), parsed.data.email.trim(), parsed.data.subject.trim(), parsed.data.message.trim()],
  );
  res.status(201).json({ message: "Thank you. Your message has been received by the SGP team." });
});

router.get("/dashboard/citizen", requireAuth, allowRoles("CITIZEN"), async (req, res) => {
  const userId = session(req).id;
  const counts = await pool.query(
    `SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending,
      COUNT(*) FILTER (WHERE status = 'IN_PROGRESS')::int AS in_progress,
      COUNT(*) FILTER (WHERE status = 'RESOLVED')::int AS resolved
     FROM complaints WHERE citizen_id = $1`,
    [userId],
  );
  const recent = await complaintQuery("AND c.citizen_id = $1", [userId], "c.updated_at DESC LIMIT 4");
  const row = counts.rows[0];
  res.json({ total: Number(row.total), pending: Number(row.pending), inProgress: Number(row.in_progress), resolved: Number(row.resolved), recent });
});

router.get("/dashboard/staff", requireAuth, allowRoles("STAFF"), async (req, res) => {
  const userId = session(req).id;
  const counts = await pool.query(
    `SELECT COUNT(*)::int AS assigned,
      COUNT(*) FILTER (WHERE status = 'IN_PROGRESS')::int AS in_progress,
      COUNT(*) FILTER (WHERE status = 'RESOLVED')::int AS resolved,
      COUNT(*) FILTER (WHERE status NOT IN ('RESOLVED', 'REJECTED') AND created_at < NOW() - INTERVAL '7 days')::int AS overdue
     FROM complaints WHERE assigned_staff_id = $1`,
    [userId],
  );
  const recent = await complaintQuery("AND c.assigned_staff_id = $1", [userId], "c.updated_at DESC LIMIT 4");
  const row = counts.rows[0];
  res.json({ assigned: Number(row.assigned), inProgress: Number(row.in_progress), resolved: Number(row.resolved), overdue: Number(row.overdue), recent });
});

router.get("/dashboard/admin", requireAuth, allowRoles("ADMIN"), async (_req, res) => {
  const [users, complaints, resolved, departments, statuses, byDepartment] = await Promise.all([
    pool.query("SELECT COUNT(*)::int AS count FROM users"),
    pool.query("SELECT COUNT(*)::int AS count FROM complaints"),
    pool.query("SELECT COUNT(*)::int AS count FROM complaints WHERE status = 'RESOLVED'"),
    pool.query("SELECT COUNT(*)::int AS count FROM departments WHERE active = true"),
    pool.query("SELECT status, COUNT(*)::int AS count FROM complaints GROUP BY status"),
    pool.query(`SELECT d.name AS department, COUNT(c.id)::int AS count FROM departments d
                LEFT JOIN complaints c ON c.department_id = d.id GROUP BY d.id ORDER BY count DESC`),
  ]);
  const statusBreakdown = Object.fromEntries(statuses.rows.map((row) => [String(row.status), Number(row.count)]));
  const recent = await complaintQuery("", [], "c.created_at DESC LIMIT 5");
  res.json({
    totalUsers: Number(users.rows[0].count),
    totalComplaints: Number(complaints.rows[0].count),
    resolvedComplaints: Number(resolved.rows[0].count),
    departments: Number(departments.rows[0].count),
    statusBreakdown,
    departmentBreakdown: byDepartment.rows.map((row) => ({ department: String(row.department), count: Number(row.count) })),
    recent,
  });
});

export default router;