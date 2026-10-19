# ChangeBack — Mainnet集中レビュー・実行計画

> 2026-10-19再開後の最新状態は [ChangeBack-launch-status.md](ChangeBack-launch-status.md) を参照。以下は前回レビュー・未承認取引計画の保存記録。今回、Studioへの9ファイル反映、再取得ソース41ファイルの一致、Studio内134件PASS、型検査・lint・ビルド、公開アプリの配信・読み取り確認まで完了した。GitHub連携・公開repo・Mainnet実行・動画は未完了で、NO-GOを維持。署名・送信は未実行。

2026-10-19 JST。判定：**現時点のMainnetローンチはNO-GO**。コントラクトは少額実験の候補として進行可能だが、Studio現行ソースの照合・修正反映・公開アプリ・Mainnet設定が未完了であり、まだ最終署名承認を求める段階ではない。実USDCの署名・送信・デプロイは一切行っていない。

## 確認済みの依存関係とブロッカー

1. Studioプロジェクト：<https://studio.arc.io/app/8fb26e26-3f43-40dc-a940-85228dbbf710>。過去のソース検証・83件のSolidity試験・E2E成功記録を再利用。今回のStudio現行状態は照合できていない。
2. ブラウザーは現在URLを十分な確度で判定できずComputer Useが停止。以後UI入力を中止した。Preview復旧の反復はしていない。
3. ローカルコピーにはTestnet専用の支払提案があり、Mainnetでは作成不能。Mainnetの投票・実行・返金・CloseではTestnet用費用制限が適用されない。今回、作業コピーで修正し、対象試験134件・フロントエンド型検査・変更箇所lintに成功。Studioへの反映は未実施。
4. Mainnet Factory許可リストは空のまま。デプロイ後にレシートと実行コードを確認してから登録する。予測アドレスの登録で先に解放しない。
5. GitHub接続経由でnoboru59631の一覧を確認したがChangeBack repoはなかった。過去のprovenanceにも「予定、未作成」とある。README・ソース公開用パッケージを用意したが、公開repoの完成を意味しない。
6. 公開アプリURLと実動画は未確認・未作成。Mainnet contract/Tx証拠も未生成。応募要件の「過去のArc/Circle助成との重複がない」「提出権利がある」はユーザー確認事項。

## コントラクトレビュー

対象は既存のChangeBackFactory / ChangeBackVault / ChangeBackVaultBase。Solidityは今回変更していない。

|項目|確認結果・残る制約|
|---|---|
|ネットワーク・token|Factory/Vaultのconstructorが5042/5042002のみ許可。USDC固定。任意token注入はテストHarnessのみ。Mainnet RPCでchainId=5042、USDC decimals=6確認。gasは18桁、ERC-20元本は6桁。|
|権限|参加者は2〜20、昇順・重複なし、閾値2以上。guardianは参加者。Factoryに管理者の出金経路なし。支出先は閾値承認者に委ねられるため、閾値分の共謀は防げない。|
|再入・二重支払|deposit/execute/executeEarlyReturn/claimForはnonReentrant。実行・claimフラグと会計更新はtransfer前。revert時は会計も戻る。voteは重複不可。同じproposalは二重実行不可だが、同じ宛先・額の別proposalは別の支払いなので実行前に履歴確認が必要。|
|期限|collectUntil直前だけdeposit可能。Activeのみ支出可。expiresAt到達時のapprove/executeは拒否。spendUntilはimmutable。Early Returnは全Paymentをphaseで止める。|
|緊急停止|guardianの一方向pauseでdeposit/新規proposal/approve/execute停止。unpauseなし。pause+24hまたは元のspendUntilの早い方から返金可能。返金・closeは第三者でも実行可能。自動送信ではない。|
|返金会計|contributions−spentを重み付き配分、累積floor差分で合計一致。claimForの送り先は登録participant固定。ゼロ拠出者へのゼロclaim不要。liability=0ならclose可能。|
|回収不能|depositを通らない直接USDC送金はstrandedSurplusで回収経路なし。USDCの宛先凍結やVault凍結でclaimが止まり得る。代替返金先・管理者救済なし。閉鎖後の誤送金も回収不能。これはv1の残存制約で、少額・参加者管理下アドレスで検証する。|

ローカルFactory artifactのruntimeはTestnet既存Factoryの実行コードと完全一致した。hashは`0x44285755364ee21aa1338601d8fdf2dd50eaa6663cb2fc930af3a89f20954ebd`。包括的監査や将来の安全保証ではない。

## 既存E2E証拠（再実行不要）

Testnet chainId 5042002、Vault `0x6450E88EFeF6Bd1aA80529765834af153cfDf386`。

- A入金0.10 → B支出0.03 → A返金0.07。Vault残高・債務0、Closed、finalized=true。
- Spend: <https://explorer.testnet.arc.io/tx/0x6b9bfade75229751e9480c0ab3142217d3eee73821cb8c43c8267ac0f1ee440e>
- Early Return: <https://explorer.testnet.arc.io/tx/0xf6772781fd50f9d20fb053532108e49bb239a7ca44c96304c5bdb76cf0b2e9b0>
- Refund: <https://explorer.testnet.arc.io/tx/0xd9ed22d8c22119cbd23355b6d4131aa7cc4e8c0183003900c43d42d77aac0d8a>
- Close: <https://explorer.testnet.arc.io/tx/0x9ea45393c2d55052a912348395ce628367cfc5f439b6a55437a47fbe1d5227d4>

## Mainnetウォレット・資金計画（未承認）

公式RPC読取：block 26624695、baseFee=20 gwei。参照結果はmainnet-readonly.json。署名前に再取得する。

|役割|アドレス|読取時USDC残高|latest/pending nonce|
|---|---|---:|---|
|A：deployer・拠出・guardian・実行・返金先|`0x03607de69C487BcC460eaD7C4Bdfd25805658b75`|3.263776842640538138|50 / 50|
|C：第3参加者、今回署名不要|`0x0f6aD6BBEE5A68D864AE5252811Dd1CBA0Be83dC`|0|0 / 0|
|B：支払先・第2承認者|`0x89A4EF745831CFe8957391Ad2e3CF55Dc3a6e502`|0.06|0 / 0|

A/B承認で2-of-3を満たす案。これによりCへのgas補充を省く。B自身への支出をBが承認する設計なので、外部独立承認を示すデモではない。各アドレスをユーザーが操作できることは署名時に確認する。秘密鍵を取得しない。

- chainId **5042**、RPC `https://rpc.mainnet.arc.io`、Explorer `https://explorer.arc.io`。
- token `0x3600000000000000000000000000000000000000`。元本上限 **0.10 USDC = 100000単位**。Bへ **0.03 = 30000単位**。Aへ **0.07 = 70000単位**。
- allowanceはVault宛100000単位だけ。無制限承認を使用しない。全Txのnative value=0。
- A nonce50をFactory作成の最初に使う場合、予測Factory `0xe5FB5C1081b951D47fCAAC554ebe3A095EEF25Fb`。最初のcreateVaultなら予測Vault `0x8073527729e7c9d1b4630C07f1E8ff48ad8640D0`。**未デプロイ、存在確認済みアドレスではない**。nonce変更・他者の先行createで変わるためレシートの実アドレスを使う。
- Factory deploymentの読み取りシミュレーション成功、estimate 2,631,442 gas、20%込み3,157,731。候補上限3,200,000 gas。
- Factory以外は未デプロイのためMainnetで連続シミュレーションできていない。各前提Txの成功後、public appから次のTxをシミュレーション・再見積もりする。

## 具体的取引順序と上限候補

|#|Tx・署名者|呼び出し先|gas上限|最大fee (USDC)|
|---:|---|---|---:|---:|
|1|Factory deploy：A|contract creation|3,200,000|0.16000000|
|2|createVault([A,C,B],2,T+3600,T+86400,A)：A|確認済Factory|3,000,000|0.09000000|
|3|approve(Vault,100000)：A|USDC|100,000|0.00500000|
|4|deposit(100000)：A|確認済Vault|200,000|0.01000000|
|5|proposePayment(B,30000,memoHash,expiry)：A|Vault|200,000|0.01000000|
|6|approve(paymentId)：A|Vault|98,519|0.00492595|
|7|approve(paymentId)：B|Vault|98,519|0.00492595|
|8|execute(paymentId)：A|Vault|151,659|0.00758295|
|9|proposeEarlyReturn(memoHash,expiry)：A|Vault|127,422|0.00637110|
|10|approve(returnId)：A|Vault|98,519|0.00492595|
|11|approve(returnId)：B|Vault|98,519|0.00492595|
|12|executeEarlyReturn(returnId)：A|Vault|103,852|0.00519260|
|13|claimFor(A)：A（内部finalize）|Vault|273,945|0.01369725|
|14|close()：A|Vault|38,620|0.00193100|

#2のみmaxFeePerGas=30 gwei、priority=1 gwei。ほかはmaxFee<=50 gwei、priority<=5 gwei。実際には見積もり+20%をgasにし、この表の上限を超える場合は送信不可。#2は既存UIのbufferなし見積もり方式。配備後のestimateが上限を超えたら変更承認まで停止する。

総gas費用上限候補 **0.32947870 USDC**、元本を含む総出金上限 **0.42947870 USDC**。返金とA/B間の移動を除く不可逆なネットワーク費用は上記gas上限内。Bの2回承認分は最大0.00985190 USDCで、観測残高0.06以内。元本はgasと同じUSDC残高なので二重に残高を数えない。

Tは#2を準備する最新ブロック時刻。既存UIのCollect期間は1時間なので#4後にActiveまで待つ。#5/#9のexpiryは準備時チェーン時刻+3600秒でspendUntil以内。proposalIdはイベントから読み、0/1と決め打ちしない。#8成功後はB TransferとtotalSpent=30000を確認。#13成功後はAへのTransfer=70000、liability=0とVault balance=0を確認してから#14。

費用最小化案は#9〜12を省いて自然RETURNを待つ10Tx（作成から24h）。早期完了を優先する上表14TxならCollect1h経過後にまとめて終了できる。いずれも署名承認はまだ受領していない。

## GOへの解除条件・最終確認内容

Studio現行ソースとこの修正を照合・反映し、既存テスト履歴と外部レビュー履歴を区別する。公開アプリを起動し、GitHubを公開する。Studio管理のtestnet専用デプロイスクリプトはMainnetに流用しない。

その後、署名者A/B、上記宛先・元本・fee上限・期限・返金先・採用する14Tx/10Tx経路・artifact hashを1つの最終承認票にまとめる。未デプロイ後続Txの見積もりは暫定であることも明示する。承認後のみFactory配備し、レシート・コード一致確認後にMainnet許可リスト更新と公開アプリ反映へ進む。前提を満たさない候補を送信したり、承認を別recipient/別chain/別artifactに転用しない。

## 公式参照

- ネットワーク：<https://docs.arc.io/arc/references/connect-to-arc>
- tokenと桁数：<https://docs.arc.io/arc/references/contract-addresses>
- Arc StudioのMainnet署名・配備はユーザー側：<https://studio.arc.io/>
- 募集要件はユーザー提供の全文を基準とした。DoraHacksページは今回の直接取得が405で、締切・随時審査の変更を独立再確認できていない。
