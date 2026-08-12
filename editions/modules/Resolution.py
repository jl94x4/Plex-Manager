def get_Resolution(movie_data):
    media_list = movie_data.get('Media', [])
    if not media_list:
        return None

    resolutions = set()
    for m in media_list:
        res = m.get('videoResolution')
        if res:
            res = res.upper()
            if res.isdigit():
                res += 'p'
            resolutions.add(res)

    if not resolutions:
        return None

    order = ["480P", "576P", "720P", "1080P", "2K", "4K", "8K"]
    sorted_res = sorted(
        resolutions,
        key=lambda x: order.index(x) if x in order else len(order)
    )
    return " · ".join(sorted_res)