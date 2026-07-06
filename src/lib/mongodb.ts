import mongoose from "mongoose";
import crypto from "crypto";

const MONGODB_URI = process.env.MONGODB_URI!;

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI environment variable is not defined");
}

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var mongooseCache: MongooseCache | undefined;
}

let cached: MongooseCache = global.mongooseCache || { conn: null, promise: null };

if (!global.mongooseCache) {
  global.mongooseCache = cached;
}

export async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
    };
    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
      return mongoose;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

// ─── Password Hashing ──────────────────────────────────────────────────────────

const SALT = "umapati-vastralay-salt-2024";

export function hashPassword(password: string): string {
  return crypto.scryptSync(password, SALT, 64).toString("hex");
}

export function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}

// ─── Product Schema ────────────────────────────────────────────────────────────

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    price: { type: Number, required: true },
    unit: { type: String, default: "pcs" },
  },
  {
    timestamps: true,
  }
);

export const Product =
  mongoose.models.Product || mongoose.model("Product", productSchema);

// ─── Credential Schema ─────────────────────────────────────────────────────────

const credentialSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
  },
  {
    timestamps: true,
  }
);

export const Credential =
  mongoose.models.Credential ||
  mongoose.model("Credential", credentialSchema);

// ─── Seed Default User ─────────────────────────────────────────────────────────

export async function seedDefaultUser() {
  await connectDB();
  const existing = await Credential.findOne({ username: "umapati" });
  if (!existing) {
    const envUser = process.env.AUTH_USERNAME || "umapati";
    const envPass = process.env.AUTH_PASSWORD || "umapati123";
    await Credential.create({
      username: envUser,
      passwordHash: hashPassword(envPass),
    });
    console.log("✅ Default user seeded:", envUser);
  }
}