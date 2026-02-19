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
      /* send prompt to our backend API route */
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ prompt }) // send user input as JSON
      });
    
      /* convert response from API into usable object */
      const data = await res.json();
    
      /* if backend returned an error status, throw it so catch block handles it */
      if (!res.ok) throw new Error(data.error);
    
      /* store AI response in state so it renders on screen */
      setResponse(data.response);
    
    } catch (err: any) {
    
      /* if request fails or API throws error, show message to user */
      setError(err.message || "Something went wrong");
    
    }
    
    /* stop loading spinner whether request succeeded or failed */
    setLoading(false);
    
  }
}
