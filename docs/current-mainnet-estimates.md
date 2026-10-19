# ChangeBack — 全工程見積もり・最終承認前レビュー

2026-10-19 JST。**Mainnet NO-GOを維持。未承認の計画であり、署名・Mainnetデプロイ・送金・書き込み解放は実行していない。**

## 今回進んだこと

Factory以外を含む14工程すべてについて、Arc Mainnet公式RPCの `eth_estimateGas` で見積もった。未配備のFactory/Vaultはリクエスト内だけのcode/storage overrideを使用した。これは実配備後のE2E成功や将来の送信成功の証明ではない。

取得開始は2026-10-19 20:56 JST。対象block `0x19877c7`、block hash `0x4912ccee1001b5b7df5c56ce0a5810fc497a00228e43c3ac35e9eca71bf88993`、chainId 5042、base fee 20 gwei。機械可読の詳細は [ChangeBack-lifecycle-estimates.json](ChangeBack-lifecycle-estimates.json)。

既存134件の合格テスト・型検査・lint・ビルドは再利用し、再実行していない。今回行ったのは不足していたガス見積もりと、その前提状態を作る仮想環境での14工程の実行のみ。製品ソースは変更していない。

## 見積もり方法と限界

- 隔離したローカルEVMで、既存artifactの本番Factory/VaultとMockERC20を使って前提storageを作成。元の本番Solidity3ファイルとStudio照合済み公開準備ソースのSHA-256一致、およびFactory init-code hashを確認した。
- Mainnet向け見積もりではMockERC20コードを使用しない。USDC proxyと実装、Arcのnative coin機構は実ネットワークのものを使った。
- 公開Explorerの検証済み `NativeFiatTokenV2_2` 実装 `0xc6ad664ac6679f4ce74e10e91449c93ec1ae3ca6` のbytecodeと、対象blockの実コードが一致。allowance mapping slot 10を実装getterで特定し、Mainnet側の実USDC getterでもoverride後100000単位を確認した。これは仮想承認であり、永続的なallowance付与はない。
- depositは未入金Vaultのstorageと仮想allowanceを使う。支払・返金は仮想Vault native残高0.10/0.07を与え、実USDC `balanceOf` でも100000/70000単位になることを確認した。
- Active期の見積もりではVaultのimmutable `collectUntil` を仮想コード内で対象blockの1秒前に設定した。実計画の1時間待ちを省略する変更ではなく、フェーズの前提を再現するための仮想状態。実artifactを書き換えたりMainnetに配備したりしていない。
- 各工程を、その時点の前提を模した独立のoverride状態で見積もった。実Mainnetで14取引を連続実行したものではない。`eth_simulateV1`、`debug_traceCall`、`eth_createAccessList` は公式RPCで未対応だった。
- ローカルMockERC20では支払実行・返金のgasが実USDCより大きかった。予算判定には実USDCを使ったMainnet RPC見積もりを採用する。ローカル値をMainnet値と混同しない。
- 実行時には最新のchain、署名者、nonce、コード、残高、allowance、期限、提案IDと前提状態で改めてestimate/simulateする。上限を超えたら送信を停止する。

## 14取引と上限修正案

下表のgas上限は**未承認の修正案**。#5を200000→195000、#9を127422→132422とし、5000 gas分の費用枠を移す。旧#9は20%余裕込みの値を15 gas超えていた。総gas費用上限は変わらない。

|#|取引・署名者|Mainnet RPC gas見積もり|20%余裕込み・切上げ|上限案gas|最大fee USDC|
|---:|---|---:|---:|---:|---:|
|1|Factory deploy・A|2,631,442|3,157,731|3,200,000|0.16000000|
|2|createVault・A|2,188,686|2,626,424|3,000,000|0.09000000|
|3|USDC approve(Vault,100000)・A|56,241|67,490|100,000|0.00500000|
|4|deposit(100000)・A|119,920|143,904|200,000|0.01000000|
|5|proposePayment(B,30000,memoHash,expiry)・A|144,074|172,889|195,000|0.00975000|
|6|approve(paymentId)・A|82,087|98,505|98,519|0.00492595|
|7|approve(paymentId)・B|64,919|77,903|98,519|0.00492595|
|8|execute(paymentId)・A|126,370|151,644|151,659|0.00758295|
|9|proposeEarlyReturn(memoHash,expiry)・A|106,197|127,437|132,422|0.00662110|
|10|approve(returnId)・A|82,099|98,519|98,519|0.00492595|
|11|approve(returnId)・B|64,931|77,918|98,519|0.00492595|
|12|executeEarlyReturn(returnId)・A|86,543|103,852|103,852|0.00519260|
|13|claimFor(A)・A、内部finalize|228,287|273,945|273,945|0.01369725|
|14|close()・A|32,183|38,620|38,620|0.00193100|

#2はmaxFeePerGas≤30 gwei、priority≤1 gwei。その他はmaxFeePerGas≤50 gwei、priority≤5 gwei。見積もり+20%を原則とし、上表のgas/fee上限はそれを超える場合の送信を許可しない。#2も今回の20%余裕込み見積もりで上限内だが、既存UIのgas設定はbufferなしなので、署名要求で実際のgas上限を確認する。

全14件が修正案の上限内。いくつかの工程は余裕込み値が上限と同値で、引数の非ゼロバイト数や状態変化により少量増えただけでも再計画が必要になる。総上限の余裕を各取引に自動転用しない。

## 費用・残高の評価

|項目|値|
|---|---:|
|見積もりgas合計|6,013,979 gas|
|20%余裕込みgas合計|7,216,781 gas|
|20 gweiでの単純参考計算、priority別|0.12027958 USDC|
|25 gweiでの単純参考計算|0.150349475 USDC|
|20%余裕込みgas×各工程のmaxFeeの合計|0.30831057 USDC|
|修正案のgas費用総上限|**0.32947870 USDC**|
|元本上限|**0.10 USDC**|
|元本を含む総出金上限|**0.42947870 USDC**|

現在の仮想見積もりに対して総上限は成立する。これは実費確定や今後の手数料上昇への保証ではない。失敗取引もgasを消費するため、累積gas費用に含める。失敗・取り消し・置換の費用も既存総枠を消費し、余力が不足したら追加実行を停止する。

Aの観測残高は3.263776842640538138 native USDC、latest/pending nonceは50/50。Bは0.06、nonce0/0。Cは残高0で今回署名不要。Aが元本とB以外のgasを負担する最大出金は0.41962680、Bの2承認gasは最大0.00985190 USDC。いずれも観測残高内。Bへの0.03着金前にも最初の承認に必要な残高がある。native/ERC-20は同一資金であり二重計上しない。

## 権限・期限・二重支払・回収

- A `0x03607de69C487BcC460eaD7C4Bdfd25805658b75`：deployer、拠出者、guardian、返金先、主実行者。
- B `0x89A4EF745831CFe8957391Ad2e3CF55Dc3a6e502`：第2承認者、0.03支払先。
- C `0x0f6aD6BBEE5A68D864AE5252811Dd1CBA0Be83dC`：第3参加者、今回署名不要。参加者は[A,C,B]昇順、閾値2。
- Factory管理者の救済・出金機能はない。2名の閾値承認者は任意宛先への支払を承認できる。B自身が受取支払を承認するデモであり、独立第三者審査ではない。
- createVault準備時のチェーン時刻Tを基準にcollectUntil=T+3600、spendUntil=T+86400。入金はcollectUntilより前、支払等はActive期だけ。proposal expiryは各準備時刻+3600以下かつspendUntil以下。期限切れのapprove/executeは拒否される。
- proposalIdはイベントで確定し、0/1を決め打ちしない。実行済みフラグと投票フラグが同一proposalの二重実行・二重投票を防ぐ。一方で別IDの同額提案は別の支払となるため、実行前に履歴・宛先・金額・memo・承認状態を確認する。
- deposit/execute/executeEarlyReturn/claimForは再入防止付き。支払/claimのフラグと会計更新は送金前、失敗なら巻き戻る。
- guardian pauseは一方向。早期返金は2承認でReturningへ移行し、未実行支払をphaseで止める。pause後の返金開始はpause+24時間または元のspendUntilの早い方。返金とcloseには送信・gasが必要。
- 今回は0.10入金→Bへ0.03→Aへ0.07返金。claimForの宛先は登録Aで固定。ゼロ拠出のB/Cをclaimしなくてもliability=0ならcloseできる。
- depositを通さない直接送金、閉鎖後の誤送金は回収経路がない。USDC凍結・停止によって支払/返金は失敗し得る。代替返金先や管理者救済はない。
- 対象blockでUSDC paused=false、A/B/Cおよび候補VaultのisBlacklisted=falseを確認。今後も非凍結である保証ではなく、署名前に再確認する。
- allowanceは確認済Vaultに100000単位だけ、全Tx native value=0。USDCの固定宛先は `0x3600000000000000000000000000000000000000`、ERC-20 decimals=6、gas decimals=18。

## NO-GO解除まで

GitHubの本人限定権限承認・公開Pushと41ファイル照合が残る。A/Bを本人が操作できること、作品提出権利・過去Arc/Circle助成との非重複も最終確認に含める。

14取引の早期返金経路は1時間の集金期間後に継続可能。自然RETURNを待つ10取引経路では作成から約24時間待つ。最終承認票で採用経路、上記個別配分修正、全宛先・期限・hash・元本・合計費用・回収制約を明示し、本人の承認を受けてから実行する。**本書は承認要求でも送信承認でもない。**

Factory候補 `0xe5FB5C1081b951D47fCAAC554ebe3A095EEF25Fb` とVault候補 `0x8073527729e7c9d1b4630C07f1E8ff48ad8640D0` は依然予測値。対象blockで両方code=`0x`を確認した。レシートとruntime一致を確認するまでMainnet許可リストには追加しない。

Factory init-code hash `0x9da2fda32239d50fc18219850c2dd91ceaf8c985f10e7e126bba42550d4feac2`、runtime hash `0x44285755364ee21aa1338601d8fdf2dd50eaa6663cb2fc930af3a89f20954ebd`。

承認後も実際の配備済みコード・状態で各工程を再見積もりし、レシートとUSDC Transferを照合する。上限・相手・ネットワーク・artifact・前提が異なれば停止する。

公式参照：[ネットワークと単一USDC残高](https://docs.arc.io/arc/references/connect-to-arc)、[契約アドレス](https://docs.arc.io/arc/references/contract-addresses)、[実USDC実装の公開検証情報](https://explorer.arc.io/api/v2/smart-contracts/0xc6ad664ac6679f4ce74e10e91449c93ec1ae3ca6)。
