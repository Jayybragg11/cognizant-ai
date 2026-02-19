// This mock replaces `import OpenAI from "openai"` in your route
const createMock = jest.fn();

class OpenAI {
  chat = {
    completions: {
      create: createMock
    }
  };

  constructor(_opts: any) {}
}

export default OpenAI;

// Allow tests to reach the mock easily
export const __openaiCreateMock = createMock;
