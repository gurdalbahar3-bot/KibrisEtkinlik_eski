export type CustomerSession = {
  userId: string;
  email: string | null;
  fullName: string | null;
  accountType: "customer";
  verificationStatus: string;
};
