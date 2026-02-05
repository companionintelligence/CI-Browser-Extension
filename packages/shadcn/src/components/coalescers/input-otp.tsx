import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from '../ui/input-otp';

type InputOTPComponent = typeof InputOTP & {
  Group: typeof InputOTPGroup;
  Slot: typeof InputOTPSlot;
  Separator: typeof InputOTPSeparator;
};

const AugmentedInputOTP = InputOTP as InputOTPComponent;

AugmentedInputOTP.Group = InputOTPGroup;
AugmentedInputOTP.Slot = InputOTPSlot;
AugmentedInputOTP.Separator = InputOTPSeparator;

export { AugmentedInputOTP as InputOTP };
