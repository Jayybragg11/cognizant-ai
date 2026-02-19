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

  return (

    <main className="min-h-screen flex items-center justify-center bg-gray-100 p-6">
  
      <div className="bg-white shadow-lg rounded-2xl p-6 w-full max-w-xl space-y-4">
  
        <h1 className="text-2xl font-bold text-center">
          AI Prompt Tester
        </h1>
  
        {/* text input where user types prompt */}
        <textarea
          value={prompt} // controlled input tied to state
          onChange={(e) => setPrompt(e.target.value)} // update state as user types
          placeholder="Ask anything..."
          className="w-full border rounded-lg p-3 resize-none h-32"
        />
  
        <div className="flex gap-2">
  
          {/* submit prompt to API */}
          <button
            onClick={handleSubmit}
            disabled={loading} // prevents spam clicking while request runs
            className="flex-1 bg-black text-white py-2 rounded-lg disabled:opacity-50"
          >
            {/* button text changes during request */}
            {loading ? "Generating..." : "Submit"}
          </button>
  
          {/* clear all UI state */}
          <button
            onClick={() => {
              setPrompt("");
              setResponse("");
              setError("");
            }}
            className="px-4 border rounded-lg"
          >
            Clear
          </button>
        </div>
      </div>
    </main>
  );
  
}
