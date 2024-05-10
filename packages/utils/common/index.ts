export async function sleep(time: number) {
    return new Promise(resolve => setTimeout(() => resolve(time), time))
}

export function anyStr2Num(str: string): BigInt {
    const numbers = new Array<String>
    let minium = Infinity

    for (let index = 0; index < str.length; index++) {
        const e = +str.charCodeAt(index);

        numbers.push(("" + e).padStart(5, "0"))

        if (minium > e) minium = e

    }

    // each number transform
    numbers.forEach((e, i) => numbers[i] = (BigInt(+e) - BigInt(minium)).toString().padStart(2, "0"))

    return BigInt(`${minium}000${BigInt(+numbers.join(""))}`)
}

export function num2anyStr(num: BigInt): string {
    const strs = num.toString().split("000")
    const baseNum = +strs[0]
    const length = +strs[1].length / 2

    let text = ''

    for (let i = 0; i < length; i++) {
        const str = strs[1].slice(i * 2, i * 2 + 2)

        // strs[1] = strs[1].replace(str, (BigInt(+str) + BigInt(baseNum)).toString().padStart(5, "0"))
        text += String.fromCharCode(+str + baseNum)
    }

    return text
}
