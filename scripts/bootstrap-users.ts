import { createClient, type User } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.AGROPULSE_TEST_USER_PASSWORD;

if (!supabaseUrl || !serviceRoleKey || !password) {
  throw new Error(
    "SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and AGROPULSE_TEST_USER_PASSWORD are required",
  );
}

if (supabaseUrl.includes("your-project") || serviceRoleKey.includes("replace-with")) {
  throw new Error("Replace local placeholders before running the bootstrap");
}

const bootstrapPassword = password;

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const primaryOrganizationId = "10000000-0000-4000-8000-000000000001";
const isolatedOrganizationId = "10000000-0000-4000-8000-000000000002";

const accounts = [
  {
    email: "producer@agropulse.test",
    memberships: [
      { organization_id: primaryOrganizationId, role: "producer" },
      { organization_id: isolatedOrganizationId, role: "producer" },
    ],
  },
  {
    email: "operator@agropulse.test",
    memberships: [{ organization_id: primaryOrganizationId, role: "operator" }],
  },
  {
    email: "advisor@agropulse.test",
    memberships: [{ organization_id: primaryOrganizationId, role: "advisor" }],
  },
  {
    email: "productor2@agropulse.test",
    memberships: [{ organization_id: isolatedOrganizationId, role: "producer" }],
  },
] as const;

async function findUser(email: string): Promise<User | undefined> {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const match = data.users.find((user) => user.email === email);
    if (match) return match;
    if (data.users.length < 100) return undefined;
  }
  throw new Error(`User lookup exceeded bounded pagination for ${email}`);
}

async function main(): Promise<void> {
  for (const account of accounts) {
    let user = await findUser(account.email);
    if (!user) {
      const { data, error } = await admin.auth.admin.createUser({
        email: account.email,
        password: bootstrapPassword,
        email_confirm: true,
      });
      if (error) throw error;
      user = data.user;
    }

    const rows = account.memberships.map((membership) => ({
      ...membership,
      user_id: user.id,
    }));
    const { error } = await admin.from("memberships").upsert(rows, {
      onConflict: "organization_id,user_id",
    });
    if (error) throw error;
    console.log(`${account.email}: ${rows.length} membership(s)`);
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
