const createMock = jest.fn();

/*
  Minimal mock that matches how you call it:
  client.chat.completions.create({ stream: true, ... })
*/
class OpenAI {
  chat = {
    completions: {
      create: createMock
    }
  };

  constructor(_opts: any) {}
}

export default OpenAI;

/* exported so tests can control behavior */
export const __openaiCreateMock = createMock;
