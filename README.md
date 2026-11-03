# dsh-compact-tuner

![鍘嬬缉闈㈡澘](https://raw.githubusercontent.com/YumoFinn/dsh-compact-tuner/main/docs/screenshot.png)

鍦ㄨ緭鍏ユ涓婃柟璋冨綋鍓嶅璇濈殑涓婁笅鏂囧帇缂╁弬鏁帮細**瑙﹀彂姣斾緥**鍜?*淇濈暀閲?*銆?
## 涓轰粈涔堥渶瑕佸畠

DSH 鐨勮嚜鍔ㄥ帇缂╃敱 `@deepseek-ai/dsh-compaction-basic` 椹卞姩锛屼袱涓弬鏁板彧瀛樺湪浜?preset 閰嶇疆閲岋細

- `thresholdRatio`锛歚thresholdTokens = min(绐楀彛 脳 姣斾緥, 绐楀彛 鈭?杈撳嚭棰勭暀 鈭?headroom)`锛?  娴嬪緱鐨?`totalTokens` 瓒婅繃瀹冨氨鍘嬬缉锛?- `retainTokens`锛氬帇缂╂椂鍘熸牱淇濈暀鐨勫熬閮?token 棰勭畻銆俙resolveCompactSpec` 瑕佹眰瀹冧弗鏍煎皬浜庨槇鍊硷紝
  鍚﹀垯鐩存帴鎶涢敊銆?
涓よ€呴兘鏄叏灞€鐨勶細鏀逛竴娆¤閲嶅惎锛屼笖瀵规墍鏈夊璇濅竴瑙嗗悓浠併€備絾闀夸换鍔″拰鐭棶绛旈渶瑕佺殑绛栫暐涓嶅悓鈥斺€?鏈夌殑鎯虫櫄鐐瑰帇銆佷繚浣忓崟杞畬鏁存€э紝鏈夌殑鎯虫棭鐐瑰帇銆佺渷绐楀彛锛涘帇缂╁悗淇濈暀澶氬皯灏鹃儴锛屽喅瀹氭帴涓嬫潵鍑犳
杩樿涓嶈寰椾笂涓嬫枃銆?
鐜版湁鎻掍欢閲岋紝`dsh-compaction-threshold` 鍜?`dsh-compact-control` 鍙皟闃堝€硷紱
`@tivility/dsh-compaction-window` 瑕嗙洊闃堝€煎拰淇濈暀閲忥紝浣嗗畠鏇挎崲 `compaction` 鍚庣銆?瑕佹眰鏀?preset 閲岀殑鍘嬬缉琛岋紝涔熸病鏈夌晫闈€傝繖涓彃浠惰ˉ鐨勬槸锛氫袱涓弬鏁伴兘鑳借皟銆佸湪浼氳瘽閲岀洿鎺ヨ皟銆?涓嶆崲鍚庣銆?
## 瀹夎

```powershell
dsh plugin --profile desktop add dsh-compact-tuner
```

閲嶅惎 DSH銆備篃鍙互浠庝晶鏍忋€屾彃浠躲€嶉〉鎼滅储瀹夎銆?
涓嶉渶瑕佹敼 preset銆俻reset 鐢?`isolate: { compaction: true }` 鏃舵瘡涓?preset 鏈夎嚜宸辩殑鍘嬬缉寮曟搸锛?鎻掍欢浼氬湪姣忎釜 agent 鐨勭涓€姝ユ妸瀹冨彇鍑烘潵涓€骞惰楗帮紝鎵€浠ュ紑绠卞嵆鐢ㄣ€?
## 鐢ㄦ硶

鐐硅緭鍏ユ涓婃柟鐨勩€屽帇缂?xx%銆嶏紝闈㈡澘涓や釜椤电锛?
| 椤电 | 鍙栧€?| 瀵瑰簲閰嶇疆 |
|---|---|---|
| 瑙﹀彂姣斾緥 | 20% / 25% / 35% / 鑷畾涔?5%鈥?5% / 璺熼殢榛樿 | `thresholdRatio` |
| 淇濈暀閲?| 8k / 20k / 40k / 鑷畾涔?1k鈥?00k token / 璺熼殢榛樿 | `retainTokens` |

鏀瑰姩鍙奖鍝嶅綋鍓嶅璇濓紝涓嬩竴姝ョ敓鏁堬紱鏂板璇濆洖鍒伴粯璁ゅ€笺€?
鍛戒护锛?
```
/compact-ratio            鏌ョ湅褰撳墠瀵硅瘽鐨勬瘮渚?/compact-ratio 0.25       璁句负 25%
/compact-ratio default    娓呴櫎瑕嗙洊
```

## 瀹炵幇

瑁呴グ鍘嬬缉寮曟搸鐨?`compactIfNeeded`锛氳皟鐢ㄥ墠鎹㈠叆甯﹁鐩栫殑閰嶇疆鍓湰锛屽湪寮曟搸鐨勫悓姝ュ墠缂€缁撴潫鍚庤繕鍘熴€?娌℃湁瑕嗙洊銆佷笉鏄帇鍔涜Е鍙戙€佹垨寮曟搸涓嶅彲鐢ㄦ椂锛岀洿鎺ヨ皟鐢ㄥ師鏂规硶銆?
鏍瑰眰鐨?`ctx.compaction` 鐩存帴瑁呴グ锛沺reset 闅旂鍑烘潵鐨勫紩鎿庡湪 `agent/pre-step` 閲岄€氳繃
`agentPresets.serviceFor(agent, 'compaction')` 鍙栧緱锛屾寜瀹炰緥鍘婚噸锛屽垏 preset 涔熶笉浼氶噸澶嶅寘瑁呫€?
## 宸茬煡琛屼负

- 鍙綔鐢ㄤ簬鍘嬪姏瑙﹀彂鐨勫帇缂╋紱涓婁笅鏂囨孩鍑哄悗鐨勬仮澶嶄笉淇濈暀灏鹃儴锛岃繖鏄悗绔涓恒€?- 淇濈暀閲?鈮?闃堝€兼椂鍚庣鎶?`retainTokens must be less than threshold`锛涙彃浠舵崟鑾峰悗鍥為€€鍒?  鎸夋瘮渚嬭绠楃殑榛樿灏鹃儴锛屽苟鍦?`compact-ratio.health.json` 璁颁竴鏉★紝鏃ュ織閲屼篃鏈変竴鏉?warn銆?- 妯″瀷绾?`modelPolicies` 閲屾樉寮忓啓鐨勪繚鐣欑瓥鐣ヤ紭鍏堜簬闈㈡澘璁剧疆銆?
## 瀛樺偍

`~/.dsh/storages/compact-ratio.json`锛岀函鏈湴锛屼笉涓婁紶銆?
## 寮€鍙?
`index.js` + `client.js` 涓や釜鏂囦欢锛屾棤鏋勫缓銆佹棤杩愯鏃朵緷璧栥€傛敼瀹岄噸鍚涓伙紝
娴忚鍣ㄥ崐渚у埛鏂伴〉闈㈠嵆鍙€?
## 璁稿彲

MIT銆?