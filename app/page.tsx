"use client";

import { useState } from "react";

export default function Home() {
  /* store prompt input */
  const [prompt, setPrompt] = useState("");

  /* store AI response */
  const [response, setResponse] = useState("");

  /* loading state */
  const [loading, setLoading] = useState(false);

  /* error state */
  const [error, setError] = useState("");

  /* send prompt to API */
  async function handleSubmit() {
    setLoading(true);
    setError("");
    setResponse("");

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ prompt })
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error);

      setResponse(data.response);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    }

    setLoading(false);
  }
}
