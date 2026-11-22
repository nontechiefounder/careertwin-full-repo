"use client";

import RoleWorkspaceHeader from "@/components/role/RoleWorkspaceHeader";

export default function ProofContractHeader({
  roleTitle,
  company,
  status,
  id,
  isComplete = true,
  missingFields = [],
  rubricVersion = "1.0.0",
  isRubricApproved = false,
  approvedRubricVersion = null,
  onApproveRubric,
  approvingRubric = false,
  onRegenerate,
  regenerating,
  onStartSourcing,
  starting,
  candidatesCount = 0,
  unreviewedCount = 0,
  activeTab = "overview",
  onTabChange,
  existingSources = [],
  onUploadSuccess
}) {
  return (
    <RoleWorkspaceHeader
      id={id}
      roleTitle={roleTitle}
      company={company}
      status={status}
      isComplete={isComplete}
      missingFields={missingFields}
      rubricVersion={rubricVersion}
      isRubricApproved={isRubricApproved}
      approvedRubricVersion={approvedRubricVersion}
      onApproveRubric={onApproveRubric}
      approvingRubric={approvingRubric}
      candidatesCount={candidatesCount}
      unreviewedCount={unreviewedCount}
      activeTab={activeTab}
      onTabChange={onTabChange}
      existingSources={existingSources}
      onUploadSuccess={onUploadSuccess}
    />
  );
}
