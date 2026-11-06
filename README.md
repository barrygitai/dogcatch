# DogCatch 演示（私人可用版）

用相机识别真狗、丢罐头、收成狗卡、放进图鉴，在地图上看遇狗记录，并和训练对手打一场巷战（Alley Clash）。  
这是按 CatchCat 同款逻辑做的**狗狗版本地演示**，不连接官方后端，无商店、无账号、无排位。

## 怎么打开

不要用 `file://` 直接双击（相机会失败）。在本目录起本地静态服务：

```bash
cd dogcatch
python3 -m http.server 8766
```

浏览器打开 `http://127.0.0.1:8766/`。窄屏全屏；桌面显示手机框。

## 页面

| 入口 | 说明 |
|------|------|
| 图鉴 | 贴纸式狗卡；顶部罐头 / 金币 / XP |
| 爪印 | 扫描：点/拖罐头 → 绿色瞄准条 → 识别狗 → 发现页 → 狗卡 |
| 地图 | 真实 GPS 居中；示例社区针脚在你附近偏移；拒绝定位会提示 |
| 对战 | 巷战训练：1 出场 + 最多 2 支援，时机条攻击 + 关键词技能 |
| 档案 | 野外日志 |

## 演示模式

扫描页 **「用演示狗试一次」**：不需要真狗或相机。仍走瞄准条，命中后必定收成一张狗卡。

## 数据（localStorage `dogcatch_demo_v1`）

- `dogs[]`、`resources { cans, coins, xp }`、`nextSerial`、`lastCanRechargeAt`
- 罐头初始 20，上限 24；约每 3 分钟回复 1 罐
- 前 10 次「三次没对准」不扣罐；前 3 次瞄准更慢并有教学文案

## 限制

- 真机识别：TensorFlow.js coco-ssd，找 class `dog`（score ≥ 0.35），首次需联网
- 相机需 HTTPS 或 localhost
- 地图必须拿到定位；拒绝则 toast，不会默认显示杭州
- 对战是本地训练，不扣罐头，狗仍在图鉴

## 文件

```
/workspace/dogcatch/
  index.html
  css/styles.css
  js/data.js
  js/storage.js
  js/app.js
  manifest.webmanifest
  assets/cat-food-can.png
  assets/demo-dog-1.jpg … demo-dog-6.jpg
  assets/icon-*.png  favicon.png
  README.md
```
