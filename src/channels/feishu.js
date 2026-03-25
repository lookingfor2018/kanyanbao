async function postJson(url, body, headers = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

async function sendViaWebhook(webhookUrl, text) {
  const result = await postJson(webhookUrl, {
    msg_type: "text",
    content: { text },
  });
  if (!result.ok || Number(result.data.code || 0) !== 0) {
    return {
      ok: false,
      channel: "feishu_webhook",
      detail: `webhook failed: status=${result.status}, body=${JSON.stringify(result.data)}`,
    };
  }
  return { ok: true, channel: "feishu_webhook", detail: "sent" };
}

async function getTenantAccessToken(appId, appSecret) {
  const result = await postJson("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
    app_id: appId,
    app_secret: appSecret,
  });
  if (!result.ok || Number(result.data.code || 0) !== 0 || !result.data.tenant_access_token) {
    return {
      ok: false,
      error: `token failed: status=${result.status}, body=${JSON.stringify(result.data)}`,
      token: "",
    };
  }
  return { ok: true, token: result.data.tenant_access_token };
}

async function sendViaChatApi({ appId, appSecret, chatId, text }) {
  const tokenResult = await getTenantAccessToken(appId, appSecret);
  if (!tokenResult.ok) {
    return { ok: false, channel: "feishu_chat_api", detail: tokenResult.error };
  }
  const result = await postJson(
    "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id",
    {
      receive_id: chatId,
      msg_type: "text",
      content: JSON.stringify({ text }),
    },
    {
      Authorization: `Bearer ${tokenResult.token}`,
    }
  );

  if (!result.ok || Number(result.data.code || 0) !== 0) {
    return {
      ok: false,
      channel: "feishu_chat_api",
      detail: `send failed: status=${result.status}, body=${JSON.stringify(result.data)}`,
    };
  }
  return { ok: true, channel: "feishu_chat_api", detail: "sent" };
}

async function sendFeishuDigest({ env, title, markdownBody }) {
  const textBody = `${title}\n\n${markdownBody}`.slice(0, 3500);

  if (env.feishu.webhookUrl) {
    return sendViaWebhook(env.feishu.webhookUrl, textBody);
  }

  if (env.feishu.appId && env.feishu.appSecret && env.feishu.chatId) {
    return sendViaChatApi({
      appId: env.feishu.appId,
      appSecret: env.feishu.appSecret,
      chatId: env.feishu.chatId,
      text: textBody,
    });
  }

  return {
    ok: false,
    channel: "feishu_none",
    detail: "missing FEISHU_WEBHOOK_URL or FEISHU_APP_ID/FEISHU_APP_SECRET/FEISHU_CHAT_ID",
  };
}

module.exports = {
  sendFeishuDigest,
};

