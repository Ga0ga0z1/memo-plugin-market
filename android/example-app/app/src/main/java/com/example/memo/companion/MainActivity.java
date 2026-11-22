package com.example.memo.companion;

import android.app.Activity;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.TextView;

public class MainActivity extends Activity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        TextView message = new TextView(this);
        message.setText("已打开伴生示例");
        message.setTextSize(22);
        message.setGravity(Gravity.CENTER);
        setContentView(message);
    }
}
