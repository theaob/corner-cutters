// iOS's Reduce Motion (Settings > Accessibility > Motion), for the game's MOTION: AUTO (Game/SystemMotion.cs).
#import <UIKit/UIKit.h>

extern "C" bool cc_reduceMotion(void)
{
    return UIAccessibilityIsReduceMotionEnabled();
}
