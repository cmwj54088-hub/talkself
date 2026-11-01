package local.ziyan.notes;

import android.app.*;
import android.content.*;
import android.os.Build;
import org.json.*;
import java.text.SimpleDateFormat;
import java.util.*;

/** Device-local one-shot reminders. Preferences mirror committed task records only. */
public final class TaskReminders extends BroadcastReceiver {
    static final String STORE="task-reminders", CHANNEL="tasks";
    static PendingIntent pending(Context c,String id){return PendingIntent.getBroadcast(c,0,new Intent(c,TaskReminders.class).setAction("local.ziyan.REMIND").setData(android.net.Uri.parse("ziyan-reminder:"+id)),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
    static boolean permitted(Context c){return (Build.VERSION.SDK_INT<33||c.checkSelfPermission("android.permission.POST_NOTIFICATIONS")==0)&&((NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE)).areNotificationsEnabled()&&(Build.VERSION.SDK_INT<31||((AlarmManager)c.getSystemService(Context.ALARM_SERVICE)).canScheduleExactAlarms());}
    static long when(JSONObject r){try{SimpleDateFormat f=new SimpleDateFormat("yyyy-MM-dd HH:mm",Locale.US);f.setLenient(false);return f.parse(r.getString("date")+" "+r.getString("time")).getTime();}catch(Exception e){return 0;}}
    static synchronized void replace(Context c,String json){try{JSONArray next=new JSONArray(json);if(next.length()>10000)return;String previous=c.getSharedPreferences(STORE,0).getString("items","[]");if(previous.equals(next.toString())){restore(c);return;}JSONArray old=new JSONArray(previous);AlarmManager a=(AlarmManager)c.getSystemService(Context.ALARM_SERVICE);for(int i=0;i<old.length();i++){String id=old.getJSONObject(i).getString("id");a.cancel(pending(c,id));((NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE)).cancel(id,1);}c.getSharedPreferences(STORE,0).edit().putString("items",next.toString()).commit();restore(c);}catch(Exception e){}}
    static synchronized void restore(Context c){try{if(!permitted(c))return;JSONArray items=new JSONArray(c.getSharedPreferences(STORE,0).getString("items","[]"));AlarmManager a=(AlarmManager)c.getSystemService(Context.ALARM_SERVICE);for(int i=0;i<items.length();i++){JSONObject r=items.getJSONObject(i);long at=when(r);if(at>System.currentTimeMillis())a.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,pending(c,r.getString("id")));}}catch(Exception e){}}
    @Override public void onReceive(Context c,Intent intent){if(!"local.ziyan.REMIND".equals(intent.getAction())){restore(c);return;}try{if(!permitted(c))return;String id=intent.getData().getSchemeSpecificPart();JSONArray items=new JSONArray(c.getSharedPreferences(STORE,0).getString("items","[]"));for(int i=0;i<items.length();i++){JSONObject r=items.getJSONObject(i);if(!id.equals(r.getString("id")))continue;long at=when(r);if(at>System.currentTimeMillis()+1000)return;NotificationManager n=(NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);n.createNotificationChannel(new NotificationChannel(CHANNEL,"待办提醒",NotificationManager.IMPORTANCE_HIGH));PendingIntent open=PendingIntent.getActivity(c,0,new Intent(c,MainActivity.class),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);n.notify(id,1,new Notification.Builder(c,CHANNEL).setSmallIcon(android.R.drawable.ic_popup_reminder).setContentTitle("自言 · 待办提醒").setContentText(r.optString("text")).setStyle(new Notification.BigTextStyle().bigText(r.optString("text"))).setContentIntent(open).setAutoCancel(true).build());break;}}catch(Exception e){}}
}
