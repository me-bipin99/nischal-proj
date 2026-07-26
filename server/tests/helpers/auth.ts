import { issueToken, signup } from "../../src/services/authService";
import type { Store } from "../../src/models/Store";
import type { User } from "../../src/models/User";

export interface TestUser {
  token: string;
  user: InstanceType<typeof User>;
  store: InstanceType<typeof Store>;
}

let counter = 0;

export interface CreateTestUserOptions {
  fullName?: string;
  email?: string;
  password?: string;
  storeName?: string;
}

/**
 * Signs up a store + user directly via authService.signup() (bypassing HTTP)
 * and returns a ready-to-use JWT plus the created documents, for use in
 * `Authorization: Bearer <token>` headers in other tests.
 */
export async function createTestUser(options: CreateTestUserOptions = {}): Promise<TestUser> {
  counter += 1;
  const fullName = options.fullName ?? `Test User ${counter}`;
  const email = options.email ?? `test-user-${counter}@example.com`;
  const password = options.password ?? "password123";
  const storeName = options.storeName ?? `Test Store ${counter}`;

  const { store, user } = await signup(fullName, email, password, storeName);
  const token = issueToken(user);

  return { token, user, store };
}
