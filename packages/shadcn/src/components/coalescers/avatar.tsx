import { Avatar, AvatarImage, AvatarFallback } from "../ui/avatar";

type AvatarComponent = typeof Avatar & {
  Image: typeof AvatarImage;
  Fallback: typeof AvatarFallback;
};

const AugmentedAvatar = Avatar as AvatarComponent;

AugmentedAvatar.Image = AvatarImage;
AugmentedAvatar.Fallback = AvatarFallback;

export { AugmentedAvatar as Avatar };
