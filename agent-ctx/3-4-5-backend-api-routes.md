# Worklog — Backend API Routes (Tasks 3, 4, 5)

## What was built

Three backend API routes for the Umapati Vatralay WhatsApp bot:

### 1. `/api/products` (GET, POST, DELETE)
- **GET** — Returns all products from the database, ordered by newest first, as `{ products: Product[] }`.
- **POST** — Creates a new product. Validates `name` (required string), `price` (required positive number), and `unit` (optional, defaults to "pcs") using Zod. Returns the created product with status 201.
- **DELETE** — Deletes a product by query parameter `?id=xxx`. Returns `{ success: true }`.

### 2. `/api/chat` (POST)
- Accepts `{ message: string }` validated with Zod.
- Fetches all products from the database and builds a Hindi/Hinglish system prompt listing available products with prices and units.
- Calls `z-ai-web-dev-sdk` LLM (`zai.chat.completions.create`) with the system prompt and user message.
- Returns `{ response: string }` with the LLM's Hindi/Hinglish reply.

### 3. `/api/read-bill` (POST)
- Accepts `{ image: string (base64), mimeType: string }` validated with Zod.
- Calls `z-ai-web-dev-sdk` VLM (`zai.chat.completions.createVision`) to analyze the bill/invoice image.
- Extracts products from the VLM's JSON response (handles markdown code block wrapping).
- **Automatically saves** all extracted products to the database.
- Returns a Hindi summary message plus the saved products array: `{ response: string, products: Product[] }`.
- Gracefully handles JSON parse failures by returning the raw VLM text.

## Notes
- All routes use proper Next.js App Router exports (GET, POST, DELETE functions).
- `z-ai-web-dev-sdk` is only used in server-side route files.
- Zod validation on all POST endpoints with clear error messages.
- Proper error handling with 400/500 status codes.
- Database is in sync (Prisma push confirmed).
- ESLint passes cleanly.