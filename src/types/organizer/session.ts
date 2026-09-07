export interface OrganizerSession {
  userId: string;
  email: string | null;
  fullName: string | null;
  accountType: "organizer";
  verificationStatus: string;
}
