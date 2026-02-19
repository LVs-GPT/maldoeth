"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CriteriaRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/my-agent");
  }, [router]);

  return (
    <div className="flex items-center justify-center py-24 text-xs text-[var(--mid)]">
      Redirecting to My Agent&hellip;
    </div>
  );
}
