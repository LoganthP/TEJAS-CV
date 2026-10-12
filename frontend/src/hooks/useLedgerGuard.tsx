import React, { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSystemStatus } from "./useSystemStatus";
import { getDemoTampers, restoreAuditBlock, restoreInferenceRecord, verifyAuditChain } from "../api/endpoints";
import { LedgerGuardDialog } from "../components/shell/LedgerGuardDialog";

export function useLedgerGuard() {
  const queryClient = useQueryClient();
  const { isCompromised, invalidateStatus } = useSystemStatus();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [actionLabel, setActionLabel] = useState<string>("action");
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const guardAction = useCallback(
    (action: () => void, label = "run") => {
      if (isCompromised) {
        setActionLabel(label);
        setPendingAction(() => action);
        setDialogOpen(true);
      } else {
        action();
      }
    },
    [isCompromised]
  );

  const handleRestore = async () => {
    try {
      setRestoring(true);
      const tampers = await getDemoTampers();
      if (tampers.audit_blocks) {
        for (const idx of tampers.audit_blocks) {
          await restoreAuditBlock(idx);
        }
      }
      if (tampers.inference_records) {
        for (const id of tampers.inference_records) {
          await restoreInferenceRecord(id);
        }
      }
      await verifyAuditChain();
      invalidateStatus();
      queryClient.invalidateQueries({ queryKey: ["auditVerifyGlobal"] });
      queryClient.invalidateQueries({ queryKey: ["demoTampersGlobal"] });
      queryClient.invalidateQueries({ queryKey: ["auditBlocksPaged"] });
      setDialogOpen(false);
      
      // Optionally run the pending action if desired
      if (pendingAction) {
        pendingAction();
        setPendingAction(null);
      }
    } catch (e) {
      console.error("Failed to restore during ledger guard", e);
    } finally {
      setRestoring(false);
    }
  };

  const handleRunAnyway = () => {
    setDialogOpen(false);
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  };

  const handleCancel = () => {
    setDialogOpen(false);
    setPendingAction(null);
  };

  const GuardModal = (
    <LedgerGuardDialog
      isOpen={dialogOpen}
      onRestore={handleRestore}
      onRunAnyway={handleRunAnyway}
      onCancel={handleCancel}
      restoring={restoring}
      targetActionLabel={actionLabel}
    />
  );

  return {
    guardAction,
    GuardModal,
    isCompromised,
  };
}
