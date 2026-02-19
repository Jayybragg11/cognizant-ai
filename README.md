# Cognizant AI Chat Demo

A production-style AI chat application built with **Next.js + React + DynamoDB + OpenAI** demonstrating real-world frontend architecture, streaming UI, and backend integration.

This project was built as a technical assessment to showcase:

- UI architecture
- state management
- API integration
- error handling
- persistence
- testing
- production patterns

---

## 🚀 Live Demo
https://YOUR-VERCEL-URL.vercel.app

---

## 📸 Screenshots

### Chat Interface
![chat](./screenshots/chat.png)

### Thread Sidebar
![threads](./screenshots/threads.png)

### Streaming Response
![stream](./screenshots/stream.gif)

---

## 🧠 Features

### Core
- Real-time AI streaming responses
- Multi-conversation threads
- Persistent chat history (DynamoDB)
- Stop generation button
- Retry failed responses
- Delete threads

### UX
- ChatGPT-style bubbles
- Instant user message display
- Auto-scrolling chat
- Loading + error states
- Mobile responsive layout

### Architecture
- Next.js App Router
- Server-only API routes
- Streaming responses via ReadableStream
- DynamoDB single-table design
- AbortController request canceling

### Testing
- Jest test suite
- Mocked OpenAI API
- Mocked DynamoDB client
- Success + failure coverage

---

## 🏗 Tech Stack

Frontend  
- Next.js 16
- React 19
- Tailwind CSS

Backend
- Next.js Route Handlers
- OpenAI SDK
- AWS DynamoDB

Testing
- Jest
- ts-jest

Deployment
- Vercel

---

## 🗄 Database Design (Single Table Pattern)

Partition Keys:

USER threads

pk = USER#<id>
sk = THREAD#<threadId>

Thread messages

pk = THREAD#<threadId>
sk = MSG#timestamp

Benefits:
- Scales infinitely
- No joins needed
- O(1) thread fetch
- O(n) message scan per thread

---

## 🔐 Environment Variables

Create `.env.local`

OPENAI_API_KEY=
AWS_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
DDB_TABLE_AI_HISTORY=
AI_HISTORY_USER_ID=demo

## 🧪 Running Tests

npm test


Tests cover:
- AI route success + failure
- Thread creation + listing
- Message save + fetch

---

## 💻 Run Locally

git clone https://github.com/YOURNAME/cognizant-ai.git

cd cognizant-ai
npm install
npm run dev

Open: http://localhost:30000


---

## ☁ Deployment

Deployed on **Vercel**

Required environment variables must be set in Vercel dashboard.

---

## ⚙️ Engineering Decisions

**Why Next.js App Router**
→ server + client in one framework

**Why DynamoDB**
→ scalable, fast, simple schema

**Why streaming responses**
→ improves perceived performance

**Why single-table design**
→ production-scale pattern used at Amazon

**Why mocks in tests**
→ deterministic test results

---

## 🔮 Future Improvements

- Thread search
- Markdown rendering
- Message reactions
- Auth support
- Rate limiting
- Pagination for long chats

---

## 👨‍💻 Author

Built by Jacques Bragg  
Software Engineer

---

## ⭐ Summary

This project demonstrates how I approach real-world frontend engineering:

- production architecture
- clean UI
- resilient API integration
- scalable database design
- testable code
