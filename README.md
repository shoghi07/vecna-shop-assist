# Shopping Assistant v3

Mobile-first AI shopping assistant with backend orchestrator.

## Architecture

- **Frontend (Antigravity App)**: Thin UI layer - passive renderer only
- **Backend (n8n workflow)**: Source of truth for all logic, intent detection, and routing

## Key Principles

1. UI contains NO business logic
2. Backend decides routing (clarification vs recommendation)
3. UI displays backend responses verbatim
4. No client-side intent detection or confidence evaluation

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env.local` file:
```bash
# Backend API endpoint
NEXT_PUBLIC_BACKEND_API_URL=http://localhost:3002/api/chat

# Shopify store domain (without https://)
NEXT_PUBLIC_SHOPIFY_DOMAIN=your-store.myshopify.com
```

3. Run development server:
```bash
npm run dev
```

4. Open [http://localhost:3002](http://localhost:3002)

## Backend Contract

### Request Format
```json
{
  "session_id": "uuid-v4",
  "current_message": "user's message",
  "chat_history": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

### Response Types

**Clarification:**
```json
{
  "response_type": "clarification",
  "intent_id": "...",
  "confidence": 0.0,
  "missing_info": ["..."],
  "clarifying_question": "..."
}
```

**Recommendation:**
```json
{
  "response_type": "recommendation",
  "intent_id": "...",
  "confidence": 0.0,
  "missing_info": [],
  "products": [...],
  "explanation": "..."
}
```

## Project Structure

```
src/
├── app/                    # Next.js app router
├── components/             # React components
│   ├── ChatScreen.tsx     # Main UI (stateful container)
│   ├── UserMessageBubble.tsx
│   ├── ClarificationMessage.tsx
│   ├── RecommendationMessage.tsx
│   ├── ProductCard.tsx
│   └── ProductList.tsx
├── lib/
│   ├── api.ts             # Backend communication
│   └── utils.ts           # Utilities
├── types/
│   └── message.ts         # Type definitions
└── config.ts              # Configuration
```

## Logic Boundaries

### ✅ Allowed in UI
- Session management (generate session ID)
- State management (chat history in memory)
- API communication
- Conditional rendering (based on `response_type`)
- User interactions (input handling, cart CTA)

### ❌ Forbidden in UI
- Intent detection
- Confidence evaluation
- Routing decisions
- Missing info detection
- Product filtering/sorting/ranking
- Clarifying question generation

## Testing

See `parity_analysis.md` for full test scenarios to prevent logic drift.
