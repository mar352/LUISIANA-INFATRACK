import React from "react";
import ZoningOcularInspectionView, { type OcularInspectionPayload } from "./ZoningOcularInspectionView";

export type { OcularInspectionPayload };

type Props = {
  application?: any;
  onUpdateApplication?: (updated: any) => void;
  onEndorseInspection?: (appId: string, notes: string) => void;
  onApprove?: (appId: string) => void;
  onDeny?: (appId: string) => void;
  onSendNotes?: (notes: string) => void;
  reviewerNotes?: string;
  onChangeReviewerNotes?: (notes: string) => void;
  updating?: boolean;
};

export function ZoningReviewMapView({
  application,
  onApprove,
  onDeny,
  onSendNotes,
  updating = false,
}: Props) {
  return (
    <ZoningOcularInspectionView
      application={application}
      officerName="Edward B. Romulo, EnP. (Zoning Officer)"
      submitting={updating}
      onApprove={(payload) => {
        if (!payload.photos || payload.photos.length === 0) {
          alert("Hindi maaaring ma-approve: Kinakailangang mag-upload ng kahit isang (1) actual site photo mula sa ocular inspection.");
          return;
        }
        if (payload.remarks && onSendNotes) {
          onSendNotes(payload.remarks);
        }
        if (application?.id && onApprove) {
          onApprove(application.id);
        }
      }}
      onReject={(payload) => {
        if (payload.remarks && onSendNotes) {
          onSendNotes(payload.remarks);
        }
        if (application?.id && onDeny) {
          onDeny(application.id);
        }
      }}
    />
  );
}

export { ZoningOcularInspectionView };
export default ZoningReviewMapView;
