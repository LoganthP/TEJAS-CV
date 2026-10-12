import React from "react";
import { useAuth } from "./useAuth";
import { Permissions } from "../types/api";

interface RequirePermissionProps {
  perm: keyof Permissions;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export const RequirePermission: React.FC<RequirePermissionProps> = ({ perm, children, fallback = null }) => {
  const { permissions, isLoading } = useAuth();

  if (isLoading) return null;

  if (permissions && permissions[perm]) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
};
