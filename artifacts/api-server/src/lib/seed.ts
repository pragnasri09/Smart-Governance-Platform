import bcrypt from "bcryptjs";
import { pool } from "@workspace/db";

export async function seedDemoData() {
  const departmentSeed = [
    ["Public Works", "Roads, street lighting, drainage, and public infrastructure."],
    ["Water Supply", "Water connections, leakage, and supply interruptions."],
    ["Electricity", "Public electrical infrastructure and street power concerns."],
    ["Sanitation", "Waste collection, cleanliness, and sanitation services."],
    ["Roads & Transport", "Traffic signals, road safety, and transport facilities."],
    ["Public Health", "Local health facilities and public health assistance."],
  ];

  for (const [name, description] of departmentSeed) {
    await pool.query(
      "INSERT INTO departments (name, description) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING",
      [name, description],
    );
  }

  const departments = await pool.query("SELECT id, name FROM departments ORDER BY id");
  const departmentId = (name: string) =>
    Number(departments.rows.find((row) => row.name === name)?.id ?? departments.rows[0].id);
  const passwordHash = await bcrypt.hash("DemoPass123!", 12);

  const users = [
    ["Aarav Mehta", "admin@sgp.gov.in", "ADMIN", null],
    ["Meera Iyer", "meera.iyer@sgp.gov.in", "STAFF", departmentId("Public Works")],
    ["Rohan Das", "rohan.das@sgp.gov.in", "STAFF", departmentId("Water Supply")],
    ["Nisha Kulkarni", "nisha.kulkarni@sgp.gov.in", "STAFF", departmentId("Sanitation")],
    ["Ananya Rao", "ananya.rao@gmail.com", "CITIZEN", null],
    ["Kabir Sharma", "kabir.sharma@gmail.com", "CITIZEN", null],
    ["Priya Nair", "priya.nair@gmail.com", "CITIZEN", null],
    ["Vikram Singh", "vikram.singh@gmail.com", "CITIZEN", null],
    ["Ishita Kapoor", "ishita.kapoor@gmail.com", "CITIZEN", null],
  ] as const;

  for (const [name, email, role, department] of users) {
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role, department_id)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (email) DO NOTHING`,
      [name, email, passwordHash, role, department],
    );
  }

  const existing = await pool.query("SELECT COUNT(*)::int AS count FROM complaints");
  if (Number(existing.rows[0].count) < 5) {
    const people = await pool.query(
      `SELECT id, email FROM users WHERE email = ANY($1::text[])`,
      [[
        "ananya.rao@gmail.com",
        "kabir.sharma@gmail.com",
        "priya.nair@gmail.com",
        "vikram.singh@gmail.com",
        "meera.iyer@sgp.gov.in",
        "rohan.das@sgp.gov.in",
        "nisha.kulkarni@sgp.gov.in",
      ]],
    );
    const idFor = (email: string) => Number(people.rows.find((row) => row.email === email)?.id);
    const demoComplaints = [
      ["SGP-DEMO-1001", "Streetlight not working near Central Park", "Electricity", "The streetlight has been out for three evenings and the area is difficult to use after sunset.", "Central Park, Sector 4", "IN_PROGRESS", idFor("ananya.rao@gmail.com"), departmentId("Electricity"), idFor("meera.iyer@sgp.gov.in")],
      ["SGP-DEMO-1002", "Water leakage on residential lane", "Water supply", "A continuous leak is flooding the lane and affecting the nearby homes.", "Lake View Road, Ward 8", "ASSIGNED", idFor("kabir.sharma@gmail.com"), departmentId("Water Supply"), idFor("rohan.das@sgp.gov.in")],
      ["SGP-DEMO-1003", "Missed waste collection", "Sanitation", "Household waste has not been collected since Monday morning.", "Gandhi Nagar, Block B", "RESOLVED", idFor("ananya.rao@gmail.com"), departmentId("Sanitation"), idFor("nisha.kulkarni@sgp.gov.in")],
      ["SGP-DEMO-1004", "Pothole creating a safety hazard", "Roads", "A deep pothole has formed near the school entrance and is unsafe for two-wheelers.", "MG Road, Ward 2", "PENDING", idFor("priya.nair@gmail.com"), departmentId("Public Works"), null],
      ["SGP-DEMO-1005", "Blocked storm drain before monsoon", "Drainage", "The drain beside the community hall is blocked with debris and needs inspection.", "Community Hall Road", "PENDING", idFor("vikram.singh@gmail.com"), departmentId("Public Works"), null],
    ] as const;
    for (const [reference, title, category, description, location, status, citizenId, depId, staffId] of demoComplaints) {
      await pool.query(
        `INSERT INTO complaints
          (reference, title, category, description, location, status, citizen_id, department_id, assigned_staff_id, remarks, resolution)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (reference) DO NOTHING`,
        [
          reference,
          title,
          category,
          description,
          location,
          status,
          citizenId,
          depId,
          staffId,
          status === "RESOLVED" ? "Collection route updated and supervisor notified." : null,
          status === "RESOLVED" ? "Waste was collected on the following morning." : null,
        ],
      );
    }
  }

  const notificationCount = await pool.query("SELECT COUNT(*)::int AS count FROM notifications");
  if (Number(notificationCount.rows[0].count) === 0) {
    const demo = await pool.query(
      `SELECT u.id, c.id AS complaint_id, c.reference
       FROM users u CROSS JOIN complaints c
       WHERE u.email = 'ananya.rao@gmail.com' AND c.reference IN ('SGP-DEMO-1001', 'SGP-DEMO-1003')`,
    );
    for (const row of demo.rows) {
      await pool.query(
        "INSERT INTO notifications (message, user_id, complaint_id) VALUES ($1, $2, $3)",
        [
          row.reference === "SGP-DEMO-1003"
            ? `Complaint ${row.reference} has been resolved.`
            : `Complaint ${row.reference} is now being reviewed by the department.`,
          row.id,
          row.complaint_id,
        ],
      );
    }
  }
}