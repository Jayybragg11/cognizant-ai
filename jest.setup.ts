import "@testing-library/jest-dom";
import { Request, Response, Headers } from "undici";

(globalThis as any).Request = Request;
(globalThis as any).Response = Response;
(globalThis as any).Headers = Headers;
