"use client";

import DeviceSupportGate from "@/components/DeviceSupportGate";

export default function CandidateLayout({ children }) {
  return <DeviceSupportGate>{children}</DeviceSupportGate>;
}
