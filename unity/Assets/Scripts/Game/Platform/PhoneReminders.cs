// The daily reminder on a phone (reminder.ts, through Unity's Mobile Notifications package 2.1 or later, only when it's
// in the project: README "Platforms"): the week's reminders planned on the device (Core/Reminders), each over the same
// id as before (4100 on), so planning again replaces them; scheduled first and only what's no longer due cancelled
// after, so a game stopped between the two never leaves the week with none. Nothing leaves the device.
#if UNITY_MOBILE_NOTIFICATIONS && (UNITY_ANDROID || UNITY_IOS)
using System;
using System.Collections.Generic;
using CornerCutters.Core;
using UnityEngine;
#if UNITY_ANDROID
using Unity.Notifications.Android;
#else
using Unity.Notifications.iOS;
#endif

namespace CornerCutters.Game
{
    public sealed class PhoneReminders : IReminderSink
    {
        const string Channel = "daily";
        Action<bool> asked;
#if UNITY_ANDROID
        PermissionRequest request;
#else
        AuthorizationRequest request;
#endif

        public PhoneReminders()
        {
#if UNITY_ANDROID
            AndroidNotificationCenter.RegisterNotificationChannel(new AndroidNotificationChannel(Channel, Lang.T("DAILY CHALLENGE"), Lang.T("DAILY REMINDER"), Importance.Default));
#endif
        }

        public void Plan(List<Reminders.Due> due)
        {
            var planned = new HashSet<int>();
            foreach (var n in due)
            {
                planned.Add(n.Id);
#if UNITY_ANDROID
                AndroidNotificationCenter.SendNotificationWithExplicitID(new AndroidNotification { Title = n.Title, Text = n.Body, FireTime = n.At, IntentData = "daily" }, Channel, n.Id);
#else
                iOSNotificationCenter.ScheduleNotification(new iOSNotification
                {
                    Identifier = n.Id.ToString(), Title = n.Title, Body = n.Body, Data = "daily", ShowInForeground = false,
                    Trigger = new iOSNotificationCalendarTrigger { Year = n.At.Year, Month = n.At.Month, Day = n.At.Day, Hour = n.At.Hour, Minute = 0, Repeats = false },
                });
#endif
            }
            for (int k = 0; k < Reminders.PlanDays; k++)
            {
                int id = Reminders.FirstId + k;
                if (planned.Contains(id)) continue;
#if UNITY_ANDROID
                AndroidNotificationCenter.CancelNotification(id);
#else
                iOSNotificationCenter.RemoveScheduledNotification(id.ToString());
#endif
            }
        }

        public void Ask(Action<bool> done)
        {
            asked = done;
#if UNITY_ANDROID
            request = new PermissionRequest();
#else
            request = new AuthorizationRequest(AuthorizationOption.Alert | AuthorizationOption.Sound, false);
#endif
        }

        /// <summary>A frame: the answer to asking, once it's come.</summary>
        public void Tick()
        {
            if (request == null) return;
#if UNITY_ANDROID
            if (request.Status == PermissionStatus.RequestPending) return;
            bool ok = request.Status == PermissionStatus.Allowed;
#else
            if (!request.IsFinished) return;
            bool ok = request.Granted;
#endif
            request = null;
            var a = asked;
            asked = null;
            a?.Invoke(ok);
        }
    }
}
#endif
