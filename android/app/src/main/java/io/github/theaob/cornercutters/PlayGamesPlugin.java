package io.github.theaob.cornercutters;

import android.app.Activity;
import android.content.Intent;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.games.PlayGames;
import com.google.android.gms.games.PlayGamesSdk;
import com.google.android.gms.games.achievement.Achievement;
import com.google.android.gms.games.achievement.AchievementBuffer;

/**
 * Google Play Games achievements (src/engine/playGames.ts): only the Google Play build calls it, and only with the
 * Play Games Services project's id in res/values/games-ids.xml. Signing in is Google's own: automatic and silent on
 * start (a "welcome back" banner), or by hand from the trophy cabinet; achievements earned on the device before are
 * sent on once signed in, and Play shows its own pop-up as each one unlocks.
 */
@CapacitorPlugin(name = "PlayGames")
public class PlayGamesPlugin extends Plugin {
    private boolean started = false;

    /** Whether the game has a Play Games Services project to talk to (its id in games-ids.xml). */
    private boolean configured() {
        int id = getContext().getResources().getIdentifier("game_services_project_id", "string", getContext().getPackageName());
        return id != 0 && !getContext().getString(id).trim().isEmpty();
    }

    private void answer(PluginCall call, boolean available, boolean signedIn) {
        JSObject ret = new JSObject();
        ret.put("available", available);
        ret.put("signedIn", signedIn);
        call.resolve(ret);
    }

    /** Start Play Games (once) and say whether the player's signed in (Google signs them in on its own if it can). */
    @PluginMethod
    public void start(PluginCall call) {
        Activity activity = getActivity();
        if (!configured() || activity == null) {
            answer(call, false, false);
            return;
        }
        try {
            if (!started) {
                PlayGamesSdk.initialize(activity.getApplicationContext());
                started = true;
            }
            PlayGames.getGamesSignInClient(activity).isAuthenticated().addOnCompleteListener((task) ->
                answer(call, true, task.isSuccessful() && task.getResult().isAuthenticated()));
        } catch (Exception e) {
            answer(call, false, false);
        }
    }

    /** Sign in by hand (Google's own sheet). */
    @PluginMethod
    public void signIn(PluginCall call) {
        Activity activity = getActivity();
        if (!started || activity == null) {
            answer(call, started, false);
            return;
        }
        PlayGames.getGamesSignInClient(activity).signIn().addOnCompleteListener((task) ->
            answer(call, true, task.isSuccessful() && task.getResult().isAuthenticated()));
    }

    /** Unlock an achievement by its Play Games id (nothing if it's unlocked there already). */
    @PluginMethod
    public void unlock(PluginCall call) {
        String id = call.getString("id");
        Activity activity = getActivity();
        if (!started || activity == null || id == null || id.isEmpty()) {
            call.resolve();
            return;
        }
        try {
            // (immediate: its answer says whether it went; not signed in, or Play busy, it's kept in the game and sent
            // again next start)
            PlayGames.getAchievementsClient(activity).unlockImmediate(id).addOnCompleteListener((task) -> {
                if (task.isSuccessful()) call.resolve();
                else call.reject("Unlock failed" + (task.getException() != null ? ": " + task.getException().getMessage() : ""));
            });
        } catch (Exception e) {
            call.reject("Unlock failed: " + e.getMessage());
        }
    }

    /**
     * The game's achievements as Play Games has them, each one's id and name (the game finds its own among them by
     * name: src/f1/playAchievements.ts). Needs the player signed in.
     */
    @PluginMethod
    public void list(PluginCall call) {
        Activity activity = getActivity();
        if (!started || activity == null) {
            call.reject("Play Games isn't started");
            return;
        }
        PlayGames.getAchievementsClient(activity).load(false).addOnCompleteListener((task) -> {
            if (!task.isSuccessful() || task.getResult() == null || task.getResult().get() == null) {
                Exception e = task.getException();
                call.reject("No achievements listed" + (e != null ? ": " + e.getMessage() : ""));
                return;
            }
            AchievementBuffer buffer = task.getResult().get();
            JSArray list = new JSArray();
            try {
                for (Achievement a : buffer) {
                    JSObject o = new JSObject();
                    o.put("id", a.getAchievementId());
                    o.put("name", a.getName());
                    list.put(o);
                }
            } finally {
                buffer.release();
            }
            JSObject ret = new JSObject();
            ret.put("achievements", list);
            call.resolve(ret);
        });
    }

    /** Google's achievements screen, over the game. */
    @PluginMethod
    public void showAchievements(PluginCall call) {
        Activity activity = getActivity();
        if (!started || activity == null) {
            call.reject("Play Games isn't started");
            return;
        }
        PlayGames.getAchievementsClient(activity).getAchievementsIntent().addOnCompleteListener((task) -> {
            if (!task.isSuccessful()) {
                call.reject("No achievements screen (not signed in?)");
                return;
            }
            Intent intent = task.getResult();
            activity.startActivityForResult(intent, 9003);
            call.resolve();
        });
    }
}
