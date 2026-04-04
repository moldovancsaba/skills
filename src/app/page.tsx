import { Suspense } from "react";
import HomeClient from "./home-client";

export default function Home() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><p>Loading...</p></div>}>
      <HomeClient />
    </Suspense>
  );
}