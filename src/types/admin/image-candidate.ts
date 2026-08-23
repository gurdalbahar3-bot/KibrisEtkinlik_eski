import type { ImageSource } from "@/types/admin/image-policy";

export type ImageCandidateStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface ImageCandidate {
  id: string;
  eventIntakeId: string;
  source: ImageSource;
  url: string;
  districtId: string;
  venueId?: string;
  aiJobId?: string;
  relevanceScore?: number;
  status: ImageCandidateStatus;
  reviewedBy?: string;
  rejectionReason?: string;
  generatedByAi?: boolean;
}
